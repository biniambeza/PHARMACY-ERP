// Review fixes: shift-close race + late offline syncs, controlled register on returns / voids,
// void same-day check in the pharmacy's zone, mobile money reference reuse, insurance zone /
// rejected claims / catch-up, store-credit edges.
const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const Sale = require('../models/Sale');
const Shift = require('../models/Shift');
const Customer = require('../models/Customer');
const StockBatch = require('../models/StockBatch');
const ControlledEntry = require('../models/ControlledEntry');
const PaymentIntent = require('../models/PaymentIntent');
const Pharmacy = require('../models/Pharmacy');
const { processSale } = require('../services/sales');
const insurance = require('../services/insurance');
const tz = require('../utils/timezone');

const addStaff = async (owner, role) => {
  const email = `${role}_${uid()}@example.com`;
  const res = await request(app).post('/api/staff').set(auth(owner.token))
    .send({ name: `${role} ${uid()}`, email, password: PASSWORD, role });
  expect(res.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { ...res.body.staff, token: login.body.token };
};

const api = (token) => ({
  get: (url) => request(app).get(url).set(auth(token)),
  post: (url, body) => request(app).post(url).set(auth(token)).send(body),
  put: (url, body) => request(app).put(url).set(auth(token)).send(body),
  del: (url) => request(app).delete(url).set(auth(token)),
});

const stocked = async (pharmacyId, overrides = {}, qty = 100) => {
  const med = await createMedicine(pharmacyId, { price: 10, ...overrides });
  const batch = await insertBatchRaw(pharmacyId, med._id, { quantity: qty, expiryDate: daysFromNow(300) });
  return { med, batch };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  await connectTestDb('review_fixes_c');
});

afterAll(disconnectTestDb);

// ---------------------------------------------------------------------------------------------
describe('Shift close vs sales', () => {
  let P;
  beforeAll(async () => {
    P = await createPharmacist();
  });

  const openShift = async (token, openingFloat = 0) => {
    const res = await api(token).post('/api/shifts/open', { openingFloat });
    expect(res.status).toBe(201);
    return res.body.shift;
  };

  test('a sale committing while the shift closes is included in the Z-report (close conflicts and retries)', async () => {
    const shift = await openShift(P.token);
    const { med } = await stocked(P.pharmacy._id);
    const pharmacy = await Pharmacy.findById(P.pharmacy._id);

    // A sale transaction in flight: it has already written the shift (salesCount) but not committed
    const session = await mongoose.startSession();
    session.startTransaction();
    const { sale } = await processSale(
      { pharmacyId: P.pharmacy._id, user: P.user, membershipRole: 'owner', pharmacy },
      { items: [{ medicineId: med._id, quantity: 2 }], payments: [{ method: 'cash', amount: 20 }] },
      { session }
    );
    expect(String(sale.shiftId)).toBe(String(shift._id));

    const closing = api(P.token).post(`/api/shifts/${shift._id}/close`, { counted: { cash: 20 } });
    await sleep(300);
    await session.commitTransaction();
    await session.endSession();

    const close = await closing;
    expect(close.status).toBe(200);
    expect(close.body.zReport.sales.count).toBe(1);
    expect(close.body.zReport.sales.total).toBe(20);
    expect(close.body.shift.expected.cash).toBe(20);
    expect(close.body.shift.variance.cash).toBe(0);
    expect(close.body.zReport.lateSales).toEqual(expect.objectContaining({ count: 0, total: 0 }));
    expect((await Shift.findById(shift._id)).salesCount).toBe(1);
  });

  test('a sale racing a close that commits first never lands in the closed shift', async () => {
    await Pharmacy.updateOne({ _id: P.pharmacy._id }, { $set: { 'settings.requireShift': true } });
    const shift = await openShift(P.token);
    const { med } = await stocked(P.pharmacy._id);

    // A close in flight: the shift is already marked closed inside an uncommitted transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    await Shift.updateOne({ _id: shift._id, status: 'open' }, { $set: { status: 'closed', closedAt: new Date() } }, { session });

    const selling = api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'cash' });
    await sleep(300);
    await session.commitTransaction();
    await session.endSession();

    const res = await selling;
    // The sale retried after the close committed: no open shift any more
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SHIFT_REQUIRED');
    expect(await Sale.countDocuments({ shiftId: shift._id })).toBe(0);
    await Pharmacy.updateOne({ _id: P.pharmacy._id }, { $set: { 'settings.requireShift': false } });
  });

  test('a stale open shift fails the online sale with 409 SHIFT_CLOSED', async () => {
    const shift = await openShift(P.token);
    const { med } = await stocked(P.pharmacy._id);
    await Shift.updateOne({ _id: shift._id }, { $set: { status: 'closed', closedAt: new Date() } });
    // Simulate the sale having read the shift while it was still open
    const realFindOne = Shift.findOne.bind(Shift);
    const spy = jest.spyOn(Shift, 'findOne').mockImplementation((filter, ...rest) => {
      if (filter && filter.status === 'open' && String(filter.userId) === String(P.user._id)) {
        return realFindOne({ _id: shift._id }, ...rest);
      }
      return realFindOne(filter, ...rest);
    });
    try {
      const pharmacy = await Pharmacy.findById(P.pharmacy._id);
      await expect(
        processSale(
          { pharmacyId: P.pharmacy._id, user: P.user, membershipRole: 'owner', pharmacy },
          { items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'cash' }
        )
      ).rejects.toMatchObject({ status: 409, code: 'SHIFT_CLOSED', message: 'Shift was closed, open a new shift' });
    } finally {
      spy.mockRestore();
    }
    expect(await Sale.countDocuments({ shiftId: shift._id })).toBe(0);
  });

  test('offline sales synced after the close attach to that shift as late sales shown on the Z-report', async () => {
    const shift = await openShift(P.token, 50);
    const { med } = await stocked(P.pharmacy._id);
    const madeAt = new Date(Date.now() - 60 * 1000);
    await Shift.updateOne({ _id: shift._id }, { $set: { openedAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const close = await api(P.token).post(`/api/shifts/${shift._id}/close`, { counted: { cash: 80 } });
    expect(close.status).toBe(200);
    const frozenSales = close.body.zReport.sales.count;

    const sync = await api(P.token).post('/api/sales/sync', {
      sales: [{
        offlineId: `off-${uid()}`,
        createdAtClient: madeAt.toISOString(),
        payload: { items: [{ medicineId: med._id, quantity: 3 }], payments: [{ method: 'cash', amount: 30 }] },
      }],
    });
    expect(sync.status).toBe(200);
    expect(sync.body.results[0].status).toBe('created');
    const sale = await Sale.findById(sync.body.results[0].saleId);
    expect(String(sale.shiftId)).toBe(String(shift._id));
    expect(sale.shiftLateSync).toBe(true);

    const after = await Shift.findById(shift._id);
    expect(after.lateSales.count).toBe(1);
    expect(after.lateSales.total).toBe(30);
    const z = await api(P.token).get(`/api/shifts/${shift._id}/z-report`);
    expect(z.body.live).toBe(false);
    expect(z.body.zReport.sales.count).toBe(frozenSales); // frozen totals unchanged
    expect(z.body.zReport.lateSales).toEqual(expect.objectContaining({ count: 1, total: 30 }));
  });
});

// ---------------------------------------------------------------------------------------------
describe('Controlled register: returns and voids', () => {
  let P;
  let pharmacist;
  let med;
  let patient;
  let rxId;

  beforeAll(async () => {
    P = await createPharmacist();
    pharmacist = await addStaff(P, 'pharmacist');
    ({ med } = await stocked(P.pharmacy._id, { genericName: 'Morphine', isControlled: true, requiresPrescription: true }, 30));
    const p = await api(P.token).post('/api/patients', { name: `Patient ${uid()}`, age: 40 });
    patient = p.body.patient;
    const rx = await api(P.token).post('/api/prescriptions', {
      patientId: patient._id, prescriberName: 'Dr. X', issueDate: new Date(), items: [{ medicineId: med._id, quantityPrescribed: 20 }],
    });
    expect(rx.status).toBe(201);
    rxId = rx.body.prescription._id;
  });

  test('a restocked return writes a return entry with the new balance', async () => {
    const sold = await api(pharmacist.token).post('/api/sales', {
      items: [{ medicineId: med._id, quantity: 4 }], patientId: patient._id, prescriptionId: rxId,
    });
    expect(sold.status).toBe(201);
    const ret = await api(P.token).post('/api/returns', {
      saleId: sold.body.sale._id, reason: 'Not needed', refundMethod: 'cash',
      items: [{ saleItemId: sold.body.sale.items[0]._id, quantity: 3 }],
    });
    expect(ret.status).toBe(201);
    const entries = await ControlledEntry.find({ pharmacyId: P.pharmacy._id, entryType: 'return' }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({ quantityIn: 3, quantityOut: 0, balanceAfter: 29 }));
    expect(String(entries[0].refId)).toBe(String(ret.body.return._id));
    expect(String(entries[0].saleId)).toBe(String(sold.body.sale._id));
    expect(String(entries[0].patientId)).toBe(String(patient._id));
  });

  test('discarded returns do not change stock and write no entry', async () => {
    const sold = await api(pharmacist.token).post('/api/sales', {
      items: [{ medicineId: med._id, quantity: 1 }], patientId: patient._id, prescriptionId: rxId,
    });
    const ret = await api(P.token).post('/api/returns', {
      saleId: sold.body.sale._id, reason: 'Damaged', refundMethod: 'cash',
      items: [{ saleItemId: sold.body.sale.items[0]._id, quantity: 1, disposition: 'discard' }],
    });
    expect(ret.status).toBe(201);
    expect(await ControlledEntry.countDocuments({ refId: ret.body.return._id })).toBe(0);
  });

  test('a void writes a return entry noted as a void', async () => {
    const sold = await api(pharmacist.token).post('/api/sales', {
      items: [{ medicineId: med._id, quantity: 2 }], patientId: patient._id, prescriptionId: rxId,
    });
    expect(sold.status).toBe(201);
    const stockBefore = (await StockBatch.find({ medicineId: med._id })).reduce((s, b) => s + b.quantity, 0);
    const v = await api(P.token).post(`/api/returns/void/${sold.body.sale._id}`, { reason: 'Wrong patient' });
    expect(v.status).toBe(200);
    const entries = await ControlledEntry.find({ saleId: sold.body.sale._id, entryType: 'return' }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].quantityIn).toBe(2);
    expect(entries[0].balanceAfter).toBe(stockBefore + 2);
    expect(entries[0].notes).toMatch(/^Void of /);
  });

  test('non-controlled returns write nothing to the register', async () => {
    const { med: plain } = await stocked(P.pharmacy._id);
    const sold = await api(P.token).post('/api/sales', { items: [{ medicineId: plain._id, quantity: 1 }] });
    await api(P.token).post(`/api/returns/void/${sold.body.sale._id}`, { reason: 'x' });
    expect(await ControlledEntry.countDocuments({ medicineId: plain._id })).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Void same-day check uses the pharmacy zone, not x-timezone', () => {
  test('a sale from yesterday (pharmacy zone) cannot be voided whatever header is sent', async () => {
    const P = await createPharmacist();
    const { med } = await stocked(P.pharmacy._id);
    const zone = tz.pharmacyTimeZone(P.pharmacy);
    const now = new Date();
    const startToday = tz.startOfZonedDay(new Date(now.getTime()), zone);
    // startOfZonedDay of a non-midnight instant uses its day in the zone
    expect(tz.dayKey(startToday, zone)).toBe(tz.dayKey(now, zone));
    const yesterdayLate = new Date(startToday.getTime() - 60 * 1000);

    // A header zone where the sale and now are the same calendar day (if one exists right now)
    const candidates = [];
    for (let h = -12; h <= 14; h += 1) candidates.push(h === 0 ? 'UTC' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`);
    const header = candidates.find((z) => tz.dayKey(yesterdayLate, z) === tz.dayKey(now, z));

    const sold = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 1 }] });
    await Sale.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(String(sold.body.sale._id)) },
      { $set: { createdAt: yesterdayLate } }
    );
    const req = request(app).post(`/api/returns/void/${sold.body.sale._id}`).set(auth(P.token));
    if (header) req.set('x-timezone', header);
    const res = await req.send({ reason: 'late' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only sales made today/);

    // Today's sale is voidable even with an extreme header
    const today = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 1 }] });
    const ok = await request(app).post(`/api/returns/void/${today.body.sale._id}`).set(auth(P.token))
      .set('x-timezone', 'Etc/GMT-14').send({ reason: 'ok' });
    expect(ok.status).toBe(200);
  });

  test('pharmacyTimeZone: configured zone when valid, else JOBS_TZ, else Addis Ababa', () => {
    expect(tz.pharmacyTimeZone({ settings: { timezone: 'Europe/London' } })).toBe('Europe/London');
    expect(tz.pharmacyTimeZone({ settings: { timezone: 'Not/AZone' } }, { JOBS_TZ: 'Asia/Tokyo' })).toBe('Asia/Tokyo');
    expect(tz.pharmacyTimeZone(null, {})).toBe('Africa/Addis_Ababa');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Mobile money references', () => {
  let P;
  let med;
  beforeAll(async () => {
    P = await createPharmacist();
    ({ med } = await stocked(P.pharmacy._id, {}, 500));
  });
  const mm = (reference, extra = {}) => ({
    items: [{ medicineId: med._id, quantity: 1 }],
    payments: [{ method: 'mobile_money', amount: 10, reference, ...extra }],
  });

  test('a typed reference cannot back two non-voided sales (per provider); voiding frees it', async () => {
    const ref = `TX-${uid()}`;
    const first = await api(P.token).post('/api/sales', mm(ref));
    expect(first.status).toBe(201);
    const dup = await api(P.token).post('/api/sales', mm(ref));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('PAYMENT_REFERENCE_USED');
    expect(dup.body.message).toContain(first.body.sale.invoiceNumber);

    // Same reference with another provider is a different transaction
    const other = await api(P.token).post('/api/sales', mm(ref, { provider: 'telebirr' }));
    expect(other.status).toBe(201);

    // Same reference twice in one sale
    const twice = await api(P.token).post('/api/sales', {
      items: [{ medicineId: med._id, quantity: 2 }],
      payments: [{ method: 'mobile_money', amount: 10, reference: `X-${uid()}` }, { method: 'mobile_money', amount: 5, reference: 'SAME' }, { method: 'mobile_money', amount: 5, reference: 'SAME' }],
    });
    expect(twice.status).toBe(400);
    expect(twice.body.code).toBe('PAYMENT_REFERENCE_USED');

    // Another pharmacy may have the same reference
    const Q = await createPharmacist();
    const { med: qMed } = await stocked(Q.pharmacy._id);
    const elsewhere = await api(Q.token).post('/api/sales', { items: [{ medicineId: qMed._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 10, reference: ref }] });
    expect(elsewhere.status).toBe(201);

    const v = await api(P.token).post(`/api/returns/void/${first.body.sale._id}`, { reason: 'wrong' });
    expect(v.status).toBe(200);
    const reused = await api(P.token).post('/api/sales', mm(ref));
    expect(reused.status).toBe(201);
  });

  test('concurrent sales with the same reference: exactly one wins', async () => {
    const ref = `RACE-${uid()}`;
    const results = await Promise.all([1, 2, 3].map(() => api(P.token).post('/api/sales', mm(ref))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await Sale.countDocuments({ pharmacyId: P.pharmacy._id, 'payments.reference': ref })).toBe(1);
  });

  test('manual intents: a used reference is refused; a second intent with the same reference cannot pay another sale', async () => {
    const ref = `MI-${uid()}`;
    const i1 = await api(P.token).post('/api/payments/intents', { amount: 10, provider: 'manual', reference: ref });
    const i2 = await api(P.token).post('/api/payments/intents', { amount: 10, provider: 'manual', reference: ref });
    expect(i1.status).toBe(201);
    expect(i2.status).toBe(201);
    const s1 = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 10, intentId: i1.body.intent._id }] });
    expect(s1.status).toBe(201);
    expect(String((await PaymentIntent.findById(i1.body.intent._id)).saleId)).toBe(String(s1.body.sale._id));

    const s2 = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 10, intentId: i2.body.intent._id }] });
    expect(s2.status).toBe(409);
    expect(s2.body.code).toBe('PAYMENT_REFERENCE_USED');
    expect((await PaymentIntent.findById(i2.body.intent._id)).saleId).toBeNull();

    const i3 = await api(P.token).post('/api/payments/intents', { amount: 10, provider: 'manual', reference: ref });
    expect(i3.status).toBe(409);
    expect(i3.body.code).toBe('PAYMENT_REFERENCE_USED');
  });

  test('an intent is locked to one sale atomically under concurrency', async () => {
    const intent = await api(P.token).post('/api/payments/intents', { amount: 10, provider: 'manual', reference: `LOCK-${uid()}` });
    const body = { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 10, intentId: intent.body.intent._id }] };
    const results = await Promise.all([1, 2, 3].map(() => api(P.token).post('/api/sales', body)));
    const won = results.filter((r) => r.status === 201);
    expect(won).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201).every((r) => [400, 409].includes(r.status))).toBe(true);
    expect(String((await PaymentIntent.findById(intent.body.intent._id)).saleId)).toBe(String(won[0].body.sale._id));
  });

  test('the reference lookup is index-backed', async () => {
    const plan = await Sale.collection.find({
      pharmacyId: P.pharmacy._id,
      'payments.method': 'mobile_money',
      payments: { $elemMatch: { method: 'mobile_money', provider: 'manual', reference: 'X' } },
      voided: { $ne: true },
    }).explain();
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('mobile_money_reference');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Insurance: time zone, rejected claims', () => {
  test('member validity uses calendar days in the insurance zone', () => {
    const zone = 'Africa/Addis_Ababa';
    // 23:30 on 31 Oct in Addis = 20:30 UTC
    const late = new Date('2026-10-31T20:30:00Z');
    expect(insurance.memberInvalidReason({ validTo: new Date('2026-10-31T00:00:00Z') }, late, zone)).toBe('');
    expect(insurance.memberInvalidReason({ validTo: '2026-10-31' }, late, zone)).toBe('');
    // 00:30 on 1 Nov in Addis = 21:30 UTC on 31 Oct: expired in Addis even though UTC is still 31 Oct
    const nextDay = new Date('2026-10-31T21:30:00Z');
    expect(insurance.memberInvalidReason({ validTo: new Date('2026-10-31T00:00:00Z') }, nextDay, zone)).toBe('expired');
    expect(insurance.memberInvalidReason({ validFrom: new Date('2026-11-01T00:00:00Z') }, late, zone)).toBe('not_yet_valid');
    expect(insurance.memberInvalidReason({ validFrom: new Date('2026-11-01T00:00:00Z') }, nextDay, zone)).toBe('');
  });

  test('manual claim periods are whole days in the insurance zone', () => {
    const r = insurance.parseRange('2026-10-01', '2026-10-31', 'Africa/Addis_Ababa');
    expect(r.periodFrom.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(r.periodTo.toISOString()).toBe('2026-10-31T20:59:59.999Z');
  });

  test('a rejected claim with payments writes off the insurer lines; a released one keeps them pending', async () => {
    const P = await createPharmacist();
    const scheme = (await api(P.token).post('/api/insurance/schemes', { name: `S ${uid()}`, type: 'cbhi', coveragePercent: 100, copayType: 'none' })).body.scheme;
    const member = (await api(P.token).post('/api/insurance/members', {
      schemeId: scheme._id, memberNo: `M-${uid()}`, name: 'Member', validFrom: daysFromNow(-30), validTo: daysFromNow(300),
    })).body.member;
    const { med } = await stocked(P.pharmacy._id);
    const sell = () => api(P.token).post('/api/sales', {
      items: [{ medicineId: med._id, quantity: 2 }],
      payments: [{ method: 'insurance', amount: 1, schemeId: scheme._id, memberId: member._id }],
    });
    const range = { from: daysFromNow(-1).toISOString(), to: daysFromNow(1).toISOString() };
    const insuranceLine = async (id) => (await Sale.findById(id)).payments.find((p) => p.method === 'insurance');

    // Partly paid then rejected: written off
    const s1 = (await sell()).body.sale;
    const c1 = (await api(P.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range })).body.claim;
    expect((await api(P.token).post(`/api/insurance/claims/${c1._id}/submit`)).status).toBe(200);
    expect((await api(P.token).post(`/api/insurance/claims/${c1._id}/payments`, { amount: 5 })).status).toBe(200);
    const rej1 = await api(P.token).post(`/api/insurance/claims/${c1._id}/reject`, { notes: 'Rest refused' });
    expect(rej1.status).toBe(200);
    expect(rej1.body.claim.salesReleased).toBe(false);
    expect((await insuranceLine(s1._id)).status).toBe('failed');
    expect(String((await Sale.findById(s1._id)).insurance.claimId)).toBe(String(c1._id));

    // Unpaid and released: back to the pool, still receivable
    const s2 = (await sell()).body.sale;
    const c2 = (await api(P.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range })).body.claim;
    expect(c2.sales.map((l) => String(l.saleId))).toEqual([String(s2._id)]);
    await api(P.token).post(`/api/insurance/claims/${c2._id}/submit`);
    const rej2 = await api(P.token).post(`/api/insurance/claims/${c2._id}/reject`, { notes: 'Fix member no' });
    expect(rej2.body.claim.salesReleased).toBe(true);
    expect((await insuranceLine(s2._id)).status).toBe('pending');
    expect((await Sale.findById(s2._id)).insurance.claimId).toBeNull();

    // Unpaid but releaseSales false: written off too
    const c3 = (await api(P.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range })).body.claim;
    await api(P.token).post(`/api/insurance/claims/${c3._id}/submit`);
    const rej3 = await api(P.token).post(`/api/insurance/claims/${c3._id}/reject`, { notes: 'Final', releaseSales: false });
    expect(rej3.body.claim.salesReleased).toBe(false);
    expect((await insuranceLine(s2._id)).status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------------------------
describe('Store credit edges', () => {
  let P;
  let med;
  beforeAll(async () => {
    P = await createPharmacist();
    ({ med } = await stocked(P.pharmacy._id, {}, 500));
  });

  // Customer with `amount` of store credit (a cash sale returned to store credit)
  const customerWithStoreCredit = async (qty = 2) => {
    const customer = await Customer.create({ pharmacyId: P.pharmacy._id, name: `C ${uid()}`, creditLimit: null });
    const sale = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: qty }], customerId: customer._id, paymentMethod: 'cash' });
    expect(sale.status).toBe(201);
    const ret = await api(P.token).post('/api/returns', {
      saleId: sale.body.sale._id, reason: 'Exchange', refundMethod: 'store_credit',
      items: [{ saleItemId: sale.body.sale.items[0]._id, quantity: qty }],
    });
    expect(ret.status).toBe(201);
    expect((await Customer.findById(customer._id)).balance).toBe(-10 * qty);
    return customer;
  };

  test('returning a sale paid with store credit gives the store credit back, not cash', async () => {
    const customer = await customerWithStoreCredit(2); // 20 store credit
    const paid = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 2 }], customerId: customer._id, paymentMethod: 'credit' });
    expect(paid.status).toBe(201);
    const sale = await Sale.findById(paid.body.sale._id);
    expect(sale.balanceDue).toBe(0);
    expect(sale.storeCreditUsed).toBe(20);
    expect((await Customer.findById(customer._id)).balance).toBe(0);

    const r1 = await api(P.token).post('/api/returns', {
      saleId: sale._id, reason: 'Unused', refundMethod: 'cash', items: [{ saleItemId: sale.items[0]._id, quantity: 1 }],
    });
    expect(r1.status).toBe(201);
    expect(r1.body.return.refundTotal).toBe(10);
    expect(r1.body.return.refundDue).toBe(0);
    expect(r1.body.return.storeCredited).toBe(10);
    expect((await Customer.findById(customer._id)).balance).toBe(-10);

    const r2 = await api(P.token).post('/api/returns', {
      saleId: sale._id, reason: 'Unused', refundMethod: 'cash', items: [{ saleItemId: sale.items[0]._id, quantity: 1 }],
    });
    expect(r2.body.return.refundDue).toBe(0);
    expect((await Customer.findById(customer._id)).balance).toBe(-20);
    expect((await Sale.findById(sale._id)).storeCreditRestored).toBe(20);
  });

  test('mixed store credit + owed credit: the owed part is reversed, the store-credit part restored', async () => {
    const customer = await customerWithStoreCredit(1); // 10 store credit
    const paid = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 3 }], customerId: customer._id, paymentMethod: 'credit' });
    const sale = await Sale.findById(paid.body.sale._id);
    expect(sale.storeCreditUsed).toBe(10);
    expect(sale.balanceDue).toBe(20);
    const ret = await api(P.token).post('/api/returns', {
      saleId: sale._id, reason: 'All back', refundMethod: 'cash', items: [{ saleItemId: sale.items[0]._id, quantity: 3 }],
    });
    expect(ret.body.return.creditReversed).toBe(20);
    expect(ret.body.return.refundDue).toBe(0);
    expect(ret.body.return.storeCredited).toBe(10);
    expect((await Customer.findById(customer._id)).balance).toBe(-10);
  });

  test('voiding a sale paid with store credit restores the store credit', async () => {
    const customer = await customerWithStoreCredit(1);
    const paid = await api(P.token).post('/api/sales', { items: [{ medicineId: med._id, quantity: 1 }], customerId: customer._id, paymentMethod: 'credit' });
    const v = await api(P.token).post(`/api/returns/void/${paid.body.sale._id}`, { reason: 'Mistake' });
    expect(v.status).toBe(200);
    expect(v.body.storeCreditRestored).toBe(10);
    expect(v.body.refundDue).toBe(0);
    expect((await Customer.findById(customer._id)).balance).toBe(-10);
  });

  test('deleting or deactivating a customer with store credit needs an owner to force it', async () => {
    const customer = await customerWithStoreCredit(1);
    const del = await api(P.token).del(`/api/customers/${customer._id}`);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('CUSTOMER_HAS_STORE_CREDIT');
    expect(del.body.message).toMatch(/10\.00 store credit/);
    const deact = await api(P.token).put(`/api/customers/${customer._id}`, { active: false });
    expect(deact.status).toBe(409);
    expect(deact.body.code).toBe('CUSTOMER_HAS_STORE_CREDIT');
    expect((await Customer.findById(customer._id)).active).toBe(true);

    // Other edits still work
    expect((await api(P.token).put(`/api/customers/${customer._id}`, { notes: 'vip' })).status).toBe(200);

    // A non-owner cannot force it
    const pharmacist = await addStaff(P, 'pharmacist');
    const notOwner = await request(app).delete(`/api/customers/${customer._id}?force=true`).set(auth(pharmacist.token));
    expect([403, 409]).toContain(notOwner.status);

    const forced = await request(app).delete(`/api/customers/${customer._id}?force=true`).set(auth(P.token));
    expect(forced.status).toBe(200);
    expect(forced.body.archived).toBe(true);
    expect((await Customer.findById(customer._id)).active).toBe(false);
  });
});
