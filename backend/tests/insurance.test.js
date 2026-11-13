const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');

const Sale = require('../models/Sale');
const InsuranceClaim = require('../models/InsuranceClaim');
const { computeInsuranceSplit } = require('../services/insurance');

let A; // owner of pharmacy A
let B; // owner of pharmacy B
let cashier; // cashier of A

const addStaff = async (owner, role) => {
  const email = `${role}_${uid()}@example.com`;
  const res = await request(app).post('/api/staff').set(auth(owner.token))
    .send({ name: `${role} ${uid()}`, email, password: PASSWORD, role });
  expect(res.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { token: login.body.token };
};

const api = (token) => ({
  get: (url) => request(app).get(url).set(auth(token)),
  post: (url, body) => request(app).post(url).set(auth(token)).send(body),
  put: (url, body) => request(app).put(url).set(auth(token)).send(body),
  del: (url) => request(app).delete(url).set(auth(token)),
});

const stocked = async (pharmacyId, overrides = {}, qty = 100) => {
  const med = await createMedicine(pharmacyId, overrides);
  await insertBatchRaw(pharmacyId, med._id, { quantity: qty, expiryDate: daysFromNow(200) });
  return med;
};

const createScheme = async (owner, overrides = {}) => {
  const res = await api(owner.token).post('/api/insurance/schemes', {
    name: `Scheme ${uid()}`,
    type: 'cbhi',
    coveragePercent: 100,
    copayType: 'none',
    copayValue: 0,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.scheme;
};

const createMember = async (owner, schemeId, overrides = {}) => {
  const res = await api(owner.token).post('/api/insurance/members', {
    schemeId,
    memberNo: `M-${uid()}`,
    name: `Member ${uid()}`,
    validFrom: daysFromNow(-30),
    validTo: daysFromNow(300),
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.member;
};

const insuranceSale = (token, { scheme, member, items, cash, extra = {} }) =>
  api(token).post('/api/sales', {
    items,
    payments: [
      { method: 'insurance', amount: 99999, schemeId: scheme._id, memberId: member._id },
      ...(cash ? [{ method: 'cash', amount: cash }] : []),
    ],
    ...extra,
  });

const range = { from: daysFromNow(-1).toISOString(), to: daysFromNow(1).toISOString() };

beforeAll(async () => {
  await connectTestDb('insurance');
  A = await createPharmacist();
  B = await createPharmacist();
  cashier = await addStaff(A, 'cashier');
});

afterAll(disconnectTestDb);

describe('computeInsuranceSplit (pure)', () => {
  const med = (id, category = 'Analgesic') => ({ _id: id, category });
  test('coverage percent, percent copay, exclusions and cap', () => {
    const scheme = {
      coveragePercent: 80, copayType: 'percent', copayValue: 10, maxPerSale: 0,
      excludedMedicineIds: ['x'], excludedCategories: ['cosmetic'],
    };
    const split = computeInsuranceSplit({
      scheme,
      lines: [{ medicine: med('a'), gross: 100 }, { medicine: med('x'), gross: 30 }, { medicine: med('b', 'Cosmetic'), gross: 20 }],
    });
    expect(split.eligibleAmount).toBe(100);
    expect(split.coveredAmount).toBe(80);
    expect(split.copayAmount).toBe(8);
    expect(split.insurerAmount).toBe(72);
    expect(split.patientAmount).toBe(78);
    expect(split.lineInsurer).toEqual([72, 0, 0]);

    const capped = computeInsuranceSplit({ scheme: { ...scheme, maxPerSale: 50 }, lines: [{ medicine: med('a'), gross: 100 }] });
    expect(capped.insurerAmount).toBe(50);

    const fixed = computeInsuranceSplit({ scheme: { coveragePercent: 100, copayType: 'fixed', copayValue: 500 }, lines: [{ medicine: med('a'), gross: 40 }] });
    expect(fixed.copayAmount).toBe(40);
    expect(fixed.insurerAmount).toBe(0);
  });
});

describe('Schemes and members', () => {
  test('owner CRUD on schemes; duplicate name rejected; cashier can view but not manage', async () => {
    const scheme = await createScheme(A, { name: 'CBHI Addis', coveragePercent: 90, payer: { name: 'EHIS', phone: '0911' } });
    expect(scheme.coveragePercent).toBe(90);
    expect(scheme.payer.name).toBe('EHIS');

    const dup = await api(A.token).post('/api/insurance/schemes', { name: 'cbhi addis' });
    expect(dup.status).toBe(409);

    const bad = await api(A.token).post('/api/insurance/schemes', { name: 'Bad', coveragePercent: 120 });
    expect(bad.status).toBe(400);

    const upd = await api(A.token).put(`/api/insurance/schemes/${scheme._id}`, { copayType: 'fixed', copayValue: 10 });
    expect(upd.status).toBe(200);
    expect(upd.body.scheme.copayType).toBe('fixed');

    const list = await api(cashier.token).get('/api/insurance/schemes?active=true');
    expect(list.status).toBe(200);
    expect(list.body.schemes.some((s) => s._id === scheme._id)).toBe(true);

    const cashierCreate = await api(cashier.token).post('/api/insurance/schemes', { name: 'Nope' });
    expect(cashierCreate.status).toBe(403);
    const cashierUpdate = await api(cashier.token).put(`/api/insurance/schemes/${scheme._id}`, { name: 'Nope' });
    expect(cashierUpdate.status).toBe(403);
    const cashierMember = await api(cashier.token).post('/api/insurance/members', { schemeId: scheme._id, memberNo: 'X', name: 'X' });
    expect(cashierMember.status).toBe(403);

    const del = await api(A.token).del(`/api/insurance/schemes/${scheme._id}`);
    expect(del.status).toBe(200);
  });

  test('member CRUD, duplicate member number and lookup with validity', async () => {
    const scheme = await createScheme(A);
    const m = await createMember(A, scheme._id, { memberNo: 'CB-001', name: 'Abebe Kebede' });
    const dup = await api(A.token).post('/api/insurance/members', { schemeId: scheme._id, memberNo: 'CB-001', name: 'Other' });
    expect(dup.status).toBe(409);

    await createMember(A, scheme._id, { memberNo: 'CB-002', name: 'Old Member', validFrom: daysFromNow(-400), validTo: daysFromNow(-5) });
    const look = await api(cashier.token).get(`/api/insurance/members/lookup?schemeId=${scheme._id}&q=CB-00`);
    expect(look.status).toBe(200);
    expect(look.body.members).toHaveLength(2);
    const old = look.body.members.find((x) => x.memberNo === 'CB-002');
    expect(old.valid).toBe(false);
    expect(old.invalidReason).toBe('expired');

    const upd = await api(A.token).put(`/api/insurance/members/${m._id}`, { phone: '0922' });
    expect(upd.status).toBe(200);
    expect(upd.body.member.phone).toBe('0922');

    const badDates = await api(A.token).put(`/api/insurance/members/${m._id}`, { validFrom: daysFromNow(10), validTo: daysFromNow(5) });
    expect(badDates.status).toBe(400);
  });
});

describe('Insurance sales', () => {
  test('server computes insurer share with coverage, fixed copay and exclusions; client amount ignored', async () => {
    const scheme = await createScheme(A, { coveragePercent: 80, copayType: 'fixed', copayValue: 5, excludedCategories: ['Cosmetic'] });
    const member = await createMember(A, scheme._id);
    const covered = await stocked(A.pharmacy._id, { price: 10 });
    const excluded = await stocked(A.pharmacy._id, { price: 20, category: 'cosmetic' });
    const items = [{ medicineId: covered._id, quantity: 5 }, { medicineId: excluded._id, quantity: 1 }];

    // total 70; eligible 50; covered 40; copay 5 -> insurer 35, patient 35
    const short = await insuranceSale(A.token, { scheme, member, items, cash: 30 });
    expect(short.status).toBe(400);

    const res = await insuranceSale(A.token, { scheme, member, items, cash: 40 });
    expect(res.status).toBe(201);
    const sale = res.body.sale;
    expect(sale.grandTotal).toBe(70);
    expect(sale.paymentStatus).toBe('paid');
    expect(sale.balanceDue).toBe(0);
    expect(sale.change).toBe(5);
    const ins = sale.payments.find((p) => p.method === 'insurance');
    expect(ins.amount).toBe(35);
    expect(ins.status).toBe('pending');
    expect(String(ins.schemeId)).toBe(String(scheme._id));
    expect(ins.memberNo).toBe(member.memberNo);
    expect(sale.payments.find((p) => p.method === 'cash').amount).toBe(35);
    expect(sale.insurance.insurerAmount).toBe(35);
    expect(sale.insurance.patientAmount).toBe(35);
    expect(sale.insurance.copayAmount).toBe(5);
    expect(sale.insurance.eligibleAmount).toBe(50);
    const byMed = (id) => sale.items.filter((i) => String(i.medicineId?._id || i.medicineId) === String(id));
    expect(byMed(covered._id).reduce((s, i) => s + i.insuranceAmount, 0)).toBe(35);
    expect(byMed(excluded._id).reduce((s, i) => s + i.insuranceAmount, 0)).toBe(0);
  });

  test('percent copay, full coverage needs no other payment line', async () => {
    const scheme = await createScheme(A, { coveragePercent: 100, copayType: 'percent', copayValue: 10 });
    const member = await createMember(A, scheme._id);
    const med = await stocked(A.pharmacy._id, { price: 25 });
    const res = await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 2 }], cash: 5 });
    expect(res.status).toBe(201);
    expect(res.body.sale.insurance.insurerAmount).toBe(45);

    const full = await createScheme(A, { coveragePercent: 100 });
    const m2 = await createMember(A, full._id);
    const res2 = await insuranceSale(A.token, { scheme: full, member: m2, items: [{ medicineId: med._id, quantity: 1 }] });
    expect(res2.status).toBe(201);
    expect(res2.body.sale.payments).toHaveLength(1);
    expect(res2.body.sale.paymentMethod).toBe('insurance');
  });

  test('expired / not yet valid / inactive members and inactive schemes are rejected', async () => {
    const scheme = await createScheme(A);
    const med = await stocked(A.pharmacy._id);
    const items = [{ medicineId: med._id, quantity: 1 }];
    const expired = await createMember(A, scheme._id, { validFrom: daysFromNow(-100), validTo: daysFromNow(-1) });
    const r1 = await insuranceSale(A.token, { scheme, member: expired, items });
    expect(r1.status).toBe(400);
    expect(r1.body.code).toBe('INSURANCE_MEMBER_INVALID');

    const future = await createMember(A, scheme._id, { validFrom: daysFromNow(5), validTo: daysFromNow(50) });
    expect((await insuranceSale(A.token, { scheme, member: future, items })).status).toBe(400);

    const inactive = await createMember(A, scheme._id, { active: false });
    expect((await insuranceSale(A.token, { scheme, member: inactive, items })).status).toBe(400);

    const ok = await createMember(A, scheme._id);
    await api(A.token).put(`/api/insurance/schemes/${scheme._id}`, { active: false });
    const r4 = await insuranceSale(A.token, { scheme, member: ok, items });
    expect(r4.status).toBe(400);
    expect(r4.body.code).toBe('INSURANCE_SCHEME_INACTIVE');
  });

  test('a sale with no covered item is rejected; legacy paymentMethod insurance rejected', async () => {
    const med = await stocked(A.pharmacy._id);
    const scheme = await createScheme(A, { excludedMedicineIds: [med._id] });
    const member = await createMember(A, scheme._id);
    const res = await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 1 }], cash: 10 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INSURANCE_NOT_COVERED');

    const legacy = await api(A.token).post('/api/sales', { paymentMethod: 'insurance', items: [{ medicineId: med._id, quantity: 1 }] });
    expect(legacy.status).toBe(400);
  });

  test('offline sync rejects insurance sales', async () => {
    const scheme = await createScheme(A);
    const member = await createMember(A, scheme._id);
    const med = await stocked(A.pharmacy._id);
    const res = await api(A.token).post('/api/sales/sync', {
      sales: [{
        offlineId: `off-${uid()}`,
        createdAtClient: new Date().toISOString(),
        payload: {
          items: [{ medicineId: med._id, quantity: 1 }],
          payments: [{ method: 'insurance', schemeId: scheme._id, memberId: member._id, amount: 10 }],
        },
      }],
    });
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('failed');
    expect(res.body.results[0].code).toBe('OFFLINE_INSURANCE_NOT_ALLOWED');
  });

  test('cashier can sell with insurance and preview the split', async () => {
    const scheme = await createScheme(A, { coveragePercent: 50 });
    const member = await createMember(A, scheme._id);
    const med = await stocked(A.pharmacy._id, { price: 10 });
    const prev = await api(cashier.token).post('/api/insurance/preview', {
      schemeId: scheme._id, memberId: member._id, lines: [{ medicineId: med._id, amount: 30 }],
    });
    expect(prev.status).toBe(200);
    expect(prev.body.insurerAmount).toBe(15);
    expect(prev.body.patientAmount).toBe(15);
    const res = await insuranceSale(cashier.token, { scheme, member, items: [{ medicineId: med._id, quantity: 3 }], cash: 15 });
    expect(res.status).toBe(201);
    expect(res.body.sale.insurance.insurerAmount).toBe(15);
  });
});

describe('Claims', () => {
  test('build (net of returns), submit, partial + full payment, nothing left to claim', async () => {
    const scheme = await createScheme(A, { coveragePercent: 100 });
    const member = await createMember(A, scheme._id);
    const med = await stocked(A.pharmacy._id, { price: 10 });
    const s1 = (await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 5 }] })).body.sale;
    const s2 = (await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 3 }] })).body.sale;
    expect(s1.insurance.insurerAmount).toBe(50);

    // Return 2 of 5 units of s1 -> 20 less to claim
    const ret = await api(A.token).post('/api/returns', {
      saleId: s1._id, reason: 'Wrong item', refundMethod: 'cash', items: [{ saleItemId: s1.items[0]._id, quantity: 2 }],
    });
    expect(ret.status).toBe(201);

    const unclaimed = await api(A.token).get(`/api/insurance/claims/unclaimed?schemeId=${scheme._id}&from=${range.from}&to=${range.to}`);
    expect(unclaimed.status).toBe(200);
    expect(unclaimed.body.total).toBe(60);

    const built = await api(A.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range });
    expect(built.status).toBe(201);
    const claim = built.body.claim;
    expect(claim.claimNumber).toMatch(/^CLM-\d{4}-\d{6}$/);
    expect(claim.status).toBe('draft');
    expect(claim.totalAmount).toBe(60);
    const line1 = claim.sales.find((l) => l.saleId === s1._id);
    expect(line1.returnedAmount).toBe(20);
    expect(line1.amount).toBe(30);
    expect((await Sale.findById(s2._id)).insurance.claimId.toString()).toBe(claim._id);

    // Already claimed sales are not claimed again
    const again = await api(A.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range });
    expect(again.status).toBe(400);

    // A return after building is picked up on submit
    await api(A.token).post('/api/returns', {
      saleId: s2._id, reason: 'Unused', refundMethod: 'cash', items: [{ saleItemId: s2.items[0]._id, quantity: 1 }],
    });
    const submitted = await api(A.token).post(`/api/insurance/claims/${claim._id}/submit`);
    expect(submitted.status).toBe(200);
    expect(submitted.body.claim.status).toBe('submitted');
    expect(submitted.body.claim.totalAmount).toBe(50);

    const over = await api(A.token).post(`/api/insurance/claims/${claim._id}/payments`, { amount: 51 });
    expect(over.status).toBe(400);

    const p1 = await api(A.token).post(`/api/insurance/claims/${claim._id}/payments`, { amount: 20, reference: 'CHQ-1' });
    expect(p1.status).toBe(200);
    expect(p1.body.claim.status).toBe('partially_paid');
    expect(p1.body.claim.outstanding).toBe(30);
    expect((await Sale.findById(s1._id)).payments.find((p) => p.method === 'insurance').status).toBe('pending');

    const p2 = await api(A.token).post(`/api/insurance/claims/${claim._id}/payments`, { amount: 30, reference: 'CHQ-2' });
    expect(p2.body.claim.status).toBe('paid');
    expect((await Sale.findById(s1._id)).payments.find((p) => p.method === 'insurance').status).toBe('completed');

    const exp = await api(A.token).get(`/api/insurance/claims/${claim._id}/export`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toMatch(/spreadsheetml/);
    expect(exp.body.slice(0, 2).toString()).toBe('PK');
  });

  test('returns refund the patient only their own share; the insurer share comes off the claim', async () => {
    // 80% coverage, no copay: price 10 x 5 = 50 -> insurer 40, patient 10
    const scheme = await createScheme(A, { coveragePercent: 80 });
    const member = await createMember(A, scheme._id);
    const med = await stocked(A.pharmacy._id, { price: 10 });
    const sale = (await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 5 }], cash: 10 })).body.sale;
    expect(sale.insurance.insurerAmount).toBe(40);

    // Return 2 of 5 -> line value 20, insurer part 16, patient refund 4
    const r1 = await api(A.token).post('/api/returns', {
      saleId: sale._id, reason: 'Wrong item', refundMethod: 'cash', items: [{ saleItemId: sale.items[0]._id, quantity: 2 }],
    });
    expect(r1.status).toBe(201);
    expect(r1.body.return.refundTotal).toBe(4);
    expect(r1.body.return.refundDue).toBe(4);

    // Return the rest -> total patient refunds equal what the patient paid (10)
    const r2 = await api(A.token).post('/api/returns', {
      saleId: sale._id, reason: 'Unused', refundMethod: 'cash', items: [{ saleItemId: sale.items[0]._id, quantity: 3 }],
    });
    expect(r2.status).toBe(201);
    expect(r2.body.return.refundTotal).toBe(6);
  });

  test('reject releases the sales; draft delete releases the sales; voided sales are not claimed', async () => {
    const scheme = await createScheme(A);
    const member = await createMember(A, scheme._id);
    const med = await stocked(A.pharmacy._id, { price: 10 });
    const s1 = (await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 1 }] })).body.sale;
    const s2 = (await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 2 }] })).body.sale;
    const voided = await api(A.token).post(`/api/returns/void/${s2._id}`, { reason: 'Mistake' });
    expect(voided.status).toBe(200);

    const built = await api(A.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range });
    expect(built.status).toBe(201);
    expect(built.body.claim.sales).toHaveLength(1);
    expect(built.body.claim.totalAmount).toBe(10);
    const id = built.body.claim._id;

    const del = await api(A.token).del(`/api/insurance/claims/${id}`);
    expect(del.status).toBe(200);
    expect((await Sale.findById(s1._id)).insurance.claimId).toBeNull();

    const rebuilt = (await api(A.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range })).body.claim;
    expect((await api(A.token).post(`/api/insurance/claims/${rebuilt._id}/reject`, { notes: 'x' })).status).toBe(400); // draft
    await api(A.token).post(`/api/insurance/claims/${rebuilt._id}/submit`);
    expect((await api(A.token).post(`/api/insurance/claims/${rebuilt._id}/reject`, {})).status).toBe(400); // notes required
    const rej = await api(A.token).post(`/api/insurance/claims/${rebuilt._id}/reject`, { notes: 'Missing prescriptions' });
    expect(rej.status).toBe(200);
    expect(rej.body.claim.status).toBe('rejected');
    expect(rej.body.claim.salesReleased).toBe(true);
    expect((await Sale.findById(s1._id)).insurance.claimId).toBeNull();
    expect((await api(A.token).post(`/api/insurance/claims/${rebuilt._id}/payments`, { amount: 1 })).status).toBe(400);
  });

  test('receivables summary with aging buckets', async () => {
    const scheme = await createScheme(A, { name: `Aging ${uid()}` });
    const member = await createMember(A, scheme._id, { validFrom: daysFromNow(-200) });
    const med = await stocked(A.pharmacy._id, { price: 10 });
    const recent = (await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 1 }] })).body.sale;
    const old = (await insuranceSale(A.token, { scheme, member, items: [{ medicineId: med._id, quantity: 4 }] })).body.sale;
    await Sale.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(old._id)) }, { $set: { createdAt: daysFromNow(-45) } });
    expect(recent.insurance.insurerAmount).toBe(10);

    const res = await api(A.token).get('/api/insurance/receivables');
    expect(res.status).toBe(200);
    const row = res.body.schemes.find((s) => s._id === scheme._id || String(s.schemeId) === scheme._id);
    expect(row.unclaimed).toBe(50);
    expect(row.outstanding).toBe(50);
    expect(row.aging['0_30']).toBe(10);
    expect(row.aging['31_60']).toBe(40);
  });
});

describe('Tenant isolation and permissions', () => {
  test('other pharmacies cannot see or use schemes, members or claims', async () => {
    const scheme = await createScheme(A);
    const member = await createMember(A, scheme._id);
    expect((await api(B.token).get(`/api/insurance/schemes/${scheme._id}`)).status).toBe(404);
    expect((await api(B.token).put(`/api/insurance/members/${member._id}`, { name: 'X' })).status).toBe(404);
    const listB = await api(B.token).get('/api/insurance/schemes');
    expect(listB.body.schemes.some((s) => s._id === scheme._id)).toBe(false);

    const medB = await stocked(B.pharmacy._id);
    const res = await insuranceSale(B.token, { scheme, member, items: [{ medicineId: medB._id, quantity: 1 }] });
    expect(res.status).toBe(404);

    const claimsB = await api(B.token).get('/api/insurance/claims');
    expect(claimsB.status).toBe(200);
    const anyA = await InsuranceClaim.findOne({ pharmacyId: A.pharmacy._id });
    if (anyA) {
      expect(claimsB.body.claims.some((c) => c._id === String(anyA._id))).toBe(false);
      expect((await api(B.token).get(`/api/insurance/claims/${anyA._id}`)).status).toBe(404);
    }
    const buildB = await api(B.token).post('/api/insurance/claims', { schemeId: scheme._id, ...range });
    expect(buildB.status).toBe(404);
  });

  test('cashier cannot manage claims or see receivables', async () => {
    expect((await api(cashier.token).get('/api/insurance/claims')).status).toBe(403);
    expect((await api(cashier.token).get('/api/insurance/receivables')).status).toBe(403);
    expect((await api(cashier.token).post('/api/insurance/claims', {})).status).toBe(403);
  });
});
