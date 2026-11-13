// Sale guards: server-side clinical acknowledgement gate (allergies / severe interactions)
// and offline sync rules (client prices, client time bounds, shift at client time).
// See services/sales.js ("Offline sync rules").
const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const Sale = require('../models/Sale');
const Shift = require('../models/Shift');
const StockBatch = require('../models/StockBatch');
const { boundOfflineTime } = require('../services/sales');
const { checkSaleClinical } = require('../services/clinical');

let A;

const sell = (token, body) => request(app).post('/api/sales').set(auth(token)).send(body);
const sync = (token, sales) => request(app).post('/api/sales/sync').set(auth(token)).send({ sales });

const stocked = async (pharmacyId, overrides = {}, qty = 100) => {
  const med = await createMedicine(pharmacyId, overrides);
  await insertBatchRaw(pharmacyId, med._id, { quantity: qty, expiryDate: daysFromNow(200) });
  return med;
};

const createPatient = async (token, body = {}) => {
  const res = await request(app).post('/api/patients').set(auth(token))
    .send({ name: `Patient ${uid()}`, sex: 'female', age: 40, ...body });
  expect(res.status).toBe(201);
  return res.body.patient;
};

const minutesAgo = (m) => new Date(Date.now() - m * 60000);

beforeAll(async () => {
  await connectTestDb('salesguards');
  A = await createPharmacist();
});

afterAll(disconnectTestDb);

describe('Clinical acknowledgement gate', () => {
  test('allergy hit for the patient needs clinicalAck (409 CLINICAL_ACK_REQUIRED), stock untouched', async () => {
    const amox = await stocked(A.pharmacy._id, { name: `Amoxil ${uid()}`, genericName: 'Amoxicillin', price: 10 });
    const patient = await createPatient(A.token, { allergies: [{ substance: 'Penicillins', severity: 'severe' }] });
    const body = { items: [{ medicineId: amox._id, quantity: 1 }], paymentMethod: 'cash', patientId: patient._id };

    const blocked = await sell(A.token, body);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('CLINICAL_ACK_REQUIRED');
    const batch = await StockBatch.findOne({ medicineId: amox._id });
    expect(batch.quantity).toBe(100);

    // A non-boolean "truthy" ack is not accepted
    const stringAck = await sell(A.token, { ...body, clinicalAck: 'yes' });
    expect(stringAck.status).toBe(409);

    const ok = await sell(A.token, { ...body, clinicalAck: true });
    expect(ok.status).toBe(201);
    const sale = await Sale.findById(ok.body.sale._id).lean();
    expect(sale.clinicalAcknowledged).toBe(true);
  });

  test('major interaction with a patient needs clinicalAck; moderate does not; no patient = no gate', async () => {
    const warfarin = await stocked(A.pharmacy._id, { name: `Coumadin ${uid()}`, genericName: 'Warfarin Sodium' });
    const ibu = await stocked(A.pharmacy._id, { name: `Brufen ${uid()}`, genericName: 'Ibuprofen' });
    const cipro = await stocked(A.pharmacy._id, { name: `Cipro ${uid()}`, genericName: 'Ciprofloxacin' });
    const patient = await createPatient(A.token);
    const items = (ids) => ids.map((id) => ({ medicineId: id, quantity: 1 }));

    const major = await sell(A.token, { items: items([warfarin._id, ibu._id]), paymentMethod: 'cash', patientId: patient._id });
    expect(major.status).toBe(409);
    expect(major.body.code).toBe('CLINICAL_ACK_REQUIRED');

    const moderate = await sell(A.token, { items: items([warfarin._id, cipro._id]), paymentMethod: 'cash', patientId: patient._id });
    expect(moderate.status).toBe(201);
    expect(moderate.body.sale.clinicalAcknowledged).toBeUndefined();

    const noPatient = await sell(A.token, { items: items([warfarin._id, ibu._id]), paymentMethod: 'cash' });
    expect(noPatient.status).toBe(201);
  });

  test('offline sync is not blocked by the gate (the sale already happened)', async () => {
    const amox = await stocked(A.pharmacy._id, { name: `Amoxil ${uid()}`, genericName: 'Amoxicillin', price: 10 });
    const patient = await createPatient(A.token, { allergies: [{ substance: 'Penicillin' }] });
    const res = await sync(A.token, [{
      offlineId: `off-${uid()}`,
      createdAtClient: minutesAgo(5).toISOString(),
      payload: { items: [{ medicineId: amox._id, quantity: 1 }], payments: [{ method: 'cash', amount: 10 }], patientId: patient._id },
    }]);
    expect(res.body.results[0].status).toBe('created');
  });

  test('checkSaleClinical rejects operator objects / arrays as patientId', async () => {
    const med = await createMedicine(A.pharmacy._id);
    await expect(checkSaleClinical({ pharmacyId: A.pharmacy._id, patientId: { $ne: null }, medicineIds: [med._id] }))
      .rejects.toMatchObject({ status: 400 });
    await expect(checkSaleClinical({ pharmacyId: A.pharmacy._id, patientId: [String(new mongoose.Types.ObjectId())], medicineIds: [med._id] }))
      .rejects.toMatchObject({ status: 400 });
    const viaApi = await request(app).post('/api/interactions/check').set(auth(A.token))
      .send({ patientId: { $gt: '' }, medicineIds: [med._id] });
    expect(viaApi.status).toBe(400);
  });
});

describe('Offline sync: client prices', () => {
  test('keeps the offline unit price when >= cost price and flags the sale', async () => {
    const med = await stocked(A.pharmacy._id, { price: 12, costPrice: 5 });
    const res = await sync(A.token, [{
      offlineId: `off-${uid()}`,
      createdAtClient: minutesAgo(10).toISOString(),
      // The price was 10 on the device when the sale was made
      payload: { items: [{ medicineId: med._id, quantity: 2, unitPrice: 10 }], payments: [{ method: 'cash', amount: 20 }], clientTotal: 20 },
    }]);
    const r = res.body.results[0];
    expect(r.status).toBe('created');
    expect(r.priceAdjusted).toBe(true);
    const sale = await Sale.findById(r.saleId).lean();
    expect(sale.grandTotal).toBe(20);
    expect(sale.items[0].unitPrice).toBe(10);
    expect(sale.discount).toBe(0);
    expect(sale.offlinePriceAdjusted).toBe(true);
  });

  test('a price below cost falls back to the current price; the shortfall is absorbed, not failed', async () => {
    const med = await stocked(A.pharmacy._id, { price: 12, costPrice: 5 });
    const res = await sync(A.token, [{
      offlineId: `off-${uid()}`,
      createdAtClient: minutesAgo(10).toISOString(),
      payload: { items: [{ medicineId: med._id, quantity: 2, unitPrice: 1 }], payments: [{ method: 'cash', amount: 5 }], clientTotal: 2 },
    }]);
    const r = res.body.results[0];
    expect(r.status).toBe('created');
    expect(r.priceAdjusted).toBe(true);
    const sale = await Sale.findById(r.saleId).lean();
    expect(sale.items[0].unitPrice).toBe(12);
    expect(sale.subtotal).toBe(24);
    // The customer paid 2 (5 tendered, 3 change): recorded total = 2, the rest as a discount
    expect(sale.grandTotal).toBe(2);
    expect(sale.discount).toBe(22);
    expect(sale.change).toBe(3);
    expect(sale.offlinePriceAdjusted).toBe(true);
  });

  test('an old queued sale without unit prices still syncs after a price rise (exclusive tax)', async () => {
    const P = await createPharmacist();
    await mongoose.model('Pharmacy').updateOne(
      { _id: P.pharmacy._id },
      { $set: { 'settings.tax': { enabled: true, rate: 15, inclusive: false, name: 'VAT' } } }
    );
    const med = await stocked(P.pharmacy._id, { price: 20, costPrice: 5 });
    const res = await sync(P.token, [{
      offlineId: `off-${uid()}`,
      createdAtClient: minutesAgo(10).toISOString(),
      payload: { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'cash', amount: 11.5 }] },
    }]);
    const r = res.body.results[0];
    expect(r.status).toBe('created');
    const sale = await Sale.findById(r.saleId).lean();
    expect(sale.amountPaid).toBeLessThanOrEqual(11.5);
    expect(Math.abs(sale.grandTotal - 11.5)).toBeLessThanOrEqual(0.02);
    expect(sale.offlinePriceAdjusted).toBe(true);
  });

  test('online sales ignore client unit prices', async () => {
    const med = await stocked(A.pharmacy._id, { price: 12, costPrice: 5 });
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1, unitPrice: 6 }], payments: [{ method: 'cash', amount: 6 }] });
    expect(res.status).toBe(400);
  });
});

describe('Offline sync: client time', () => {
  test('boundOfflineTime', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    expect(boundOfflineTime(null, now)).toEqual({ at: null, flag: '', raw: null });
    const recent = new Date('2026-06-01T11:00:00Z');
    expect(boundOfflineTime(recent, now)).toEqual({ at: recent, flag: '', raw: recent });
    const skew = new Date('2026-06-01T12:03:00Z');
    expect(boundOfflineTime(skew, now).at).toEqual(now);
    expect(boundOfflineTime(skew, now).flag).toBe('');
    expect(boundOfflineTime(new Date('2026-06-01T12:06:00Z'), now)).toMatchObject({ at: now, flag: 'future' });
    expect(boundOfflineTime(new Date('2026-05-20T12:00:00Z'), now)).toMatchObject({ at: now, flag: 'stale' });
  });

  test('createdAt (used by reports) = client time within bounds; out of bounds is accepted and flagged', async () => {
    const med = await stocked(A.pharmacy._id, { price: 10 });
    const line = { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'cash', amount: 10 }] };
    const inBounds = minutesAgo(3 * 24 * 60);
    const future = new Date(Date.now() + 60 * 60000);
    const stale = minutesAgo(10 * 24 * 60);
    const res = await sync(A.token, [
      { offlineId: `off-${uid()}`, createdAtClient: inBounds.toISOString(), payload: line },
      { offlineId: `off-${uid()}`, createdAtClient: future.toISOString(), payload: line },
      { offlineId: `off-${uid()}`, createdAtClient: stale.toISOString(), payload: line },
    ]);
    const [r1, r2, r3] = res.body.results;
    expect([r1.status, r2.status, r3.status]).toEqual(['created', 'created', 'created']);

    const s1 = await Sale.findById(r1.saleId).lean();
    expect(new Date(s1.createdAt).getTime()).toBe(inBounds.getTime());
    expect(new Date(s1.offlineCreatedAt).getTime()).toBe(inBounds.getTime());
    expect(s1.offlineTimeFlag).toBeUndefined();

    const s2 = await Sale.findById(r2.saleId).lean();
    expect(r2.timeFlag).toBe('future');
    expect(s2.offlineTimeFlag).toBe('future');
    expect(new Date(s2.offlineClientCreatedAt).getTime()).toBe(future.getTime());
    expect(new Date(s2.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(s2.createdAt).getTime()).toBe(new Date(s2.offlineCreatedAt).getTime());

    const s3 = await Sale.findById(r3.saleId).lean();
    expect(r3.timeFlag).toBe('stale');
    expect(new Date(s3.offlineClientCreatedAt).getTime()).toBe(stale.getTime());
    expect(Date.now() - new Date(s3.createdAt).getTime()).toBeLessThan(60000);
  });
});

describe('Offline sync: shift at client time', () => {
  test('attaches to the shift open at the client time, else the current one', async () => {
    const S = await createPharmacist();
    const med = await stocked(S.pharmacy._id, { price: 10 });
    const userId = S.user._id;
    const earlier = await Shift.create({
      pharmacyId: S.pharmacy._id, shiftNumber: `SH-T-${uid()}`, userId, status: 'closed',
      openedAt: minutesAgo(300), closedAt: minutesAgo(200),
    });
    const current = await Shift.create({
      pharmacyId: S.pharmacy._id, shiftNumber: `SH-T-${uid()}`, userId, status: 'open', openedAt: minutesAgo(60),
    });
    const line = { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'cash', amount: 10 }] };
    const res = await sync(S.token, [
      { offlineId: `off-${uid()}`, createdAtClient: minutesAgo(250).toISOString(), payload: line },
      { offlineId: `off-${uid()}`, createdAtClient: minutesAgo(30).toISOString(), payload: line },
      // Between the shifts: no shift was open then -> current shift
      { offlineId: `off-${uid()}`, createdAtClient: minutesAgo(120).toISOString(), payload: line },
    ]);
    const sales = await Promise.all(res.body.results.map((r) => Sale.findById(r.saleId).lean()));
    expect(String(sales[0].shiftId)).toBe(String(earlier._id));
    expect(String(sales[1].shiftId)).toBe(String(current._id));
    expect(String(sales[2].shiftId)).toBe(String(current._id));
  });

  test('an offline sale is accepted without a shift even when the pharmacy requires one', async () => {
    const S = await createPharmacist();
    await mongoose.model('Pharmacy').updateOne({ _id: S.pharmacy._id }, { $set: { 'settings.requireShift': true } });
    const med = await stocked(S.pharmacy._id, { price: 10 });
    const res = await sync(S.token, [{
      offlineId: `off-${uid()}`,
      createdAtClient: minutesAgo(5).toISOString(),
      payload: { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'cash', amount: 10 }] },
    }]);
    expect(res.body.results[0].status).toBe('created');
    const online = await sell(S.token, { items: [{ medicineId: med._id, quantity: 1 }] });
    expect(online.body.code).toBe('SHIFT_REQUIRED');
  });
});
