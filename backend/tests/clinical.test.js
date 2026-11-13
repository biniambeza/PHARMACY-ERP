const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const Sale = require('../models/Sale');
const StockBatch = require('../models/StockBatch');
const ControlledEntry = require('../models/ControlledEntry');
const Prescription = require('../models/Prescription');
const {
  recordControlledDispenses, recordControlledReceipt, recordPrescriptionDispense, checkSaleClinical,
} = require('../services/clinical');

let A; // owner of pharmacy A
let B; // owner of pharmacy B
let cashier;
let pharmacist;

const addStaff = async (owner, role) => {
  const email = `${role}_${uid()}@example.com`;
  const res = await request(app).post('/api/staff').set(auth(owner.token))
    .send({ name: `${role} ${uid()}`, email, password: PASSWORD, role });
  expect(res.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);
  return { ...res.body.staff, token: login.body.token };
};

const createPatient = async (token, body = {}) => {
  const res = await request(app).post('/api/patients').set(auth(token))
    .send({ name: `Patient ${uid()}`, sex: 'female', age: 40, ...body });
  expect(res.status).toBe(201);
  return res.body.patient;
};

const createRx = async (token, body) => {
  const res = await request(app).post('/api/prescriptions').set(auth(token))
    .send({ prescriberName: 'Dr. Test', issueDate: new Date(), ...body });
  return res;
};

// Sells through the real sales API with a patient + prescription; since Wave 3 the POS
// sale itself writes the controlled register entries (services/sales.js).
const sellAndRegister = async ({ owner, items, patientId, prescriptionId }) => {
  const res = await request(app).post('/api/sales').set(auth(owner.token))
    .send({ items, paymentMethod: 'cash', patientId, prescriptionId });
  expect(res.status).toBe(201);
  const sale = await Sale.findById(res.body.sale._id).lean();
  const entries = await ControlledEntry.find({ saleId: sale._id }).sort({ _id: 1 }).lean();
  return { sale, entries };
};

beforeAll(async () => {
  await connectTestDb('clinical');
  A = await createPharmacist();
  B = await createPharmacist();
  cashier = await addStaff(A, 'cashier');
  pharmacist = await addStaff(A, 'pharmacist');
});

afterAll(disconnectTestDb);

describe('Patients', () => {
  test('CRUD, search and allergy validation', async () => {
    const p = await createPatient(A.token, {
      name: 'Abebe Kebede', phone: '0911223344',
      allergies: [{ substance: 'Penicillin', reaction: 'Rash', severity: 'severe' }],
      conditions: 'Hypertension, Diabetes',
    });
    expect(p.allergies).toHaveLength(1);
    expect(p.conditions).toEqual(['Hypertension', 'Diabetes']);

    const search = await request(app).get('/api/patients?search=abebe').set(auth(A.token));
    expect(search.status).toBe(200);
    expect(search.body.patients.some((x) => x._id === p._id)).toBe(true);

    const upd = await request(app).put(`/api/patients/${p._id}`).set(auth(pharmacist.token)).send({ phone: '0999' });
    expect(upd.status).toBe(200);
    expect(upd.body.patient.phone).toBe('0999');

    const bad = await request(app).post('/api/patients').set(auth(A.token))
      .send({ name: 'X', allergies: [{ severity: 'severe' }] });
    expect(bad.status).toBe(400);
    const noName = await request(app).post('/api/patients').set(auth(A.token)).send({});
    expect(noName.status).toBe(400);
  });

  test('tenant isolation', async () => {
    const p = await createPatient(A.token, { name: `Isolated ${uid()}` });
    expect((await request(app).get(`/api/patients/${p._id}`).set(auth(B.token))).status).toBe(404);
    expect((await request(app).put(`/api/patients/${p._id}`).set(auth(B.token)).send({ name: 'Hack' })).status).toBe(404);
    const list = await request(app).get('/api/patients').set(auth(B.token));
    expect(list.body.patients.some((x) => x._id === p._id)).toBe(false);
    const rx = await createRx(B.token, { patientId: p._id });
    expect(rx.status).toBe(404);
    const hist = await request(app).get(`/api/patients/${p._id}/history`).set(auth(B.token));
    expect(hist.status).toBe(404);
  });

  test('permissions: cashier can view (not manage) patients; cannot manage, rules or the register', async () => {
    expect((await request(app).get('/api/patients').set(auth(cashier.token))).status).toBe(200);
    expect((await request(app).post('/api/patients').set(auth(cashier.token)).send({ name: 'X' })).status).toBe(403);
    expect((await request(app).post('/api/prescriptions').set(auth(cashier.token)).send({})).status).toBe(403);
    expect((await request(app).get('/api/controlled/register').set(auth(cashier.token))).status).toBe(403);
    expect((await request(app).post('/api/interactions/rules').set(auth(cashier.token))
      .send({ substanceA: 'a', substanceB: 'b' })).status).toBe(403);
    // ...but the POS check is allowed
    expect((await request(app).post('/api/interactions/check').set(auth(cashier.token))
      .send({ medicineIds: [] })).status).toBe(200);
    // Pharmacist role can work with clinical data
    expect((await request(app).get('/api/controlled/register').set(auth(pharmacist.token))).status).toBe(200);
  });
});

describe('Prescriptions', () => {
  test('create with image, list without image, get with image; rejects bad images', async () => {
    const patient = await createPatient(A.token);
    const med = await createMedicine(A.pharmacy._id, { genericName: 'Amoxicillin' });
    const png = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`;
    const res = await createRx(A.token, {
      patientId: patient._id, image: png, imageName: 'rx.png',
      items: [{ medicineId: med._id, dose: '500mg', frequency: 'TID', durationDays: 7, quantityPrescribed: 21 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.prescription.number).toMatch(/^RX-\d{4}-\d{6}$/);
    expect(res.body.prescription.items[0].name).toBe(med.name);
    expect(res.body.prescription.image).toBeUndefined();
    expect(res.body.prescription.hasImage).toBe(true);

    const list = await request(app).get(`/api/prescriptions?patientId=${patient._id}`).set(auth(A.token));
    expect(list.status).toBe(200);
    expect(list.body.prescriptions).toHaveLength(1);
    expect(list.body.prescriptions[0].image).toBeUndefined();

    const one = await request(app).get(`/api/prescriptions/${res.body.prescription._id}`).set(auth(A.token));
    expect(one.body.prescription.image).toBe(png);

    const svg = await createRx(A.token, {
      patientId: patient._id, image: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
    });
    expect(svg.status).toBe(400);
    const big = await createRx(A.token, {
      patientId: patient._id, image: `data:image/png;base64,${'A'.repeat(960000)}`,
    });
    expect([400, 413]).toContain(big.status);
  });

  test('refills due and prescription dispensing counters', async () => {
    const patient = await createPatient(A.token);
    const med = await createMedicine(A.pharmacy._id);
    await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 100, expiryDate: daysFromNow(300) });
    const rxRes = await createRx(A.token, {
      patientId: patient._id,
      items: [{ medicineId: med._id, durationDays: 10, quantityPrescribed: 10, refillsAllowed: 1 }],
    });
    const rxId = rxRes.body.prescription._id;
    const saleRes = await request(app).post('/api/sales').set(auth(A.token))
      .send({ items: [{ medicineId: med._id, quantity: 10 }], paymentMethod: 'cash' });
    const sale = await Sale.findById(saleRes.body.sale._id).lean();
    // Pretend it was dispensed 8 days ago
    sale.createdAt = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    await recordPrescriptionDispense({ pharmacyId: A.pharmacy._id, prescriptionId: rxId, sale });

    const due = await request(app).get('/api/prescriptions/refills-due?days=7').set(auth(A.token));
    expect(due.status).toBe(200);
    const row = due.body.refills.find((r) => String(r.prescriptionId) === rxId);
    expect(row).toBeTruthy();
    expect(row.daysUntilDue).toBeLessThanOrEqual(2);

    // Refill used: second fill completes the prescription; a third is rejected
    await recordPrescriptionDispense({ pharmacyId: A.pharmacy._id, prescriptionId: rxId, sale: { ...sale, createdAt: new Date() } });
    const rx = await Prescription.findById(rxId).lean();
    expect(rx.items[0].quantityDispensed).toBe(20);
    expect(rx.items[0].refillsUsed).toBe(1);
    expect(rx.status).toBe('completed');
    await expect(recordPrescriptionDispense({ pharmacyId: A.pharmacy._id, prescriptionId: rxId, sale }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('Controlled register', () => {
  let med;
  let patient;
  let rxId;

  beforeAll(async () => {
    med = await createMedicine(A.pharmacy._id, { genericName: 'Morphine', isControlled: true, controlledSchedule: 'II' });
    await insertBatchRaw(A.pharmacy._id, med._id, { batchNo: 'M1', quantity: 5, expiryDate: daysFromNow(100) });
    await insertBatchRaw(A.pharmacy._id, med._id, { batchNo: 'M2', quantity: 20, expiryDate: daysFromNow(400) });
    patient = await createPatient(A.token);
    const rx = await createRx(A.token, { patientId: patient._id, items: [{ medicineId: med._id, quantityPrescribed: 30 }] });
    rxId = rx.body.prescription._id;
  });

  test('dispense without patient/prescription is rejected', async () => {
    // The POS refuses a controlled sale without patient + prescription (nothing is written)
    const res = await request(app).post('/api/sales').set(auth(A.token))
      .send({ items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'cash', prescription: { number: 'X', prescriber: 'Y' } });
    expect(res.status).toBe(400);
    expect(await ControlledEntry.countDocuments({ medicineId: med._id })).toBe(0);
    // Simulate the 1 unit dispensed earlier so the next test starts from a stock of 24
    await StockBatch.updateOne({ pharmacyId: A.pharmacy._id, medicineId: med._id, batchNo: 'M1' }, { $inc: { quantity: -1 } });
    const sale = { _id: new mongoose.Types.ObjectId(), items: [{ medicineId: med._id, quantity: 1 }] };
    await expect(recordControlledDispenses({ pharmacyId: A.pharmacy._id, sale, userId: A.user._id }))
      .rejects.toMatchObject({ status: 400 });
    await expect(recordControlledDispenses({ pharmacyId: A.pharmacy._id, sale, patientId: patient._id }))
      .rejects.toMatchObject({ status: 400 });
    // A prescription of another patient is rejected too
    const other = await createPatient(A.token);
    await expect(recordControlledDispenses({ pharmacyId: A.pharmacy._id, sale, patientId: other._id, prescriptionId: rxId }))
      .rejects.toMatchObject({ status: 400 });
    // Cashier role cannot dispense controlled medicines
    await expect(recordControlledDispenses({
      pharmacyId: A.pharmacy._id, sale, patientId: patient._id, prescriptionId: rxId, role: 'cashier',
    })).rejects.toMatchObject({ status: 403 });
    // Non-controlled sales need nothing
    const plain = await createMedicine(A.pharmacy._id);
    expect(await recordControlledDispenses({
      pharmacyId: A.pharmacy._id, sale: { items: [{ medicineId: plain._id, quantity: 1 }] },
    })).toEqual([]);
  });

  test('entries carry the running balance across batches', async () => {
    const before = await ControlledEntry.countDocuments({ medicineId: med._id });
    expect(before).toBe(0);
    // stock is 24 now (1 sold in the previous test); sell 7 -> FEFO splits 4 from M1 + 3 from M2
    const { entries } = await sellAndRegister({
      owner: A, items: [{ medicineId: med._id, quantity: 7 }], patientId: patient._id, prescriptionId: rxId,
    });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.quantityOut)).toEqual([4, 3]);
    expect(entries.map((e) => e.balanceAfter)).toEqual([20, 17]);
    expect(entries[0].prescriberName).toBe('Dr. Test');

    // Receipt adds to the register
    const batch = await insertBatchRaw(A.pharmacy._id, med._id, { batchNo: 'M3', quantity: 10, expiryDate: daysFromNow(500) });
    const receipt = await recordControlledReceipt({
      pharmacyId: A.pharmacy._id, medicineId: med._id, batchId: batch._id, quantity: 10, userId: A.user._id,
    });
    expect(receipt.balanceAfter).toBe(27);
    expect(receipt.quantityIn).toBe(10);

    const reg = await request(app).get(`/api/controlled/register?medicineId=${med._id}`).set(auth(A.token));
    expect(reg.status).toBe(200);
    const group = reg.body.groups[0];
    expect(group.openingBalance).toBe(24);
    expect(group.totalOut).toBe(7);
    expect(group.totalIn).toBe(10);
    expect(group.closingBalance).toBe(27);
    expect(group.entries[0].patient.name).toBe(patient.name);

    // Period after all entries: opening = closing = last balance
    const later = await request(app).get(`/api/controlled/register?medicineId=${med._id}&from=${daysFromNow(1).toISOString()}`)
      .set(auth(A.token));
    expect(later.body.groups[0].openingBalance).toBe(27);
    expect(later.body.groups[0].entries).toHaveLength(0);

    // Tenant isolation of the register
    const other = await request(app).get(`/api/controlled/register?medicineId=${med._id}`).set(auth(B.token));
    expect(other.status).toBe(404);
  });
});

describe('Interactions and allergies', () => {
  test('global rules, custom rules and allergy hits', async () => {
    const warfarin = await createMedicine(A.pharmacy._id, { name: `Coumadin ${uid()}`, genericName: 'Warfarin Sodium' });
    const combo = await createMedicine(A.pharmacy._id, { name: `Combo ${uid()}`, genericName: 'Paracetamol + Ibuprofen' });
    const amox = await createMedicine(A.pharmacy._id, { name: `Amoxil ${uid()}`, genericName: 'Amoxicillin' });
    const patient = await createPatient(A.token, { allergies: [{ substance: 'Penicillins', severity: 'severe' }] });

    const res = await request(app).post('/api/interactions/check').set(auth(A.token))
      .send({ patientId: patient._id, medicineIds: [warfarin._id, combo._id, amox._id] });
    expect(res.status).toBe(200);
    const hit = res.body.interactions.find((i) => i.substanceA === 'ibuprofen' && i.substanceB === 'warfarin');
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('major');
    expect(hit.source).toBe('global');
    expect(res.body.allergyHits).toHaveLength(1);
    expect(String(res.body.allergyHits[0].medicineId)).toBe(String(amox._id));

    // Custom rule (pharmacy A only)
    const rule = await request(app).post('/api/interactions/rules').set(auth(A.token))
      .send({ substanceA: 'Paracetamol', substanceB: 'Amoxicillin', severity: 'minor', description: 'test' });
    expect(rule.status).toBe(201);
    expect(rule.body.rule.substanceA).toBe('amoxicillin');
    const res2 = await checkSaleClinical({ pharmacyId: A.pharmacy._id, medicineIds: [combo._id, amox._id] });
    expect(res2.interactions.some((i) => i.source === 'pharmacy' && i.severity === 'minor')).toBe(true);
    expect(res2.allergyHits).toEqual([]);

    const dup = await request(app).post('/api/interactions/rules').set(auth(A.token))
      .send({ substanceA: 'amoxicillin', substanceB: 'paracetamol' });
    expect(dup.status).toBe(409);

    const rulesA = await request(app).get('/api/interactions/rules').set(auth(A.token));
    expect(rulesA.body.global.length).toBeGreaterThanOrEqual(20);
    expect(rulesA.body.custom).toHaveLength(1);
    const rulesB = await request(app).get('/api/interactions/rules').set(auth(B.token));
    expect(rulesB.body.custom).toHaveLength(0);
    expect((await request(app).delete(`/api/interactions/rules/${rule.body.rule._id}`).set(auth(B.token))).status).toBe(404);
    expect((await request(app).delete(`/api/interactions/rules/${rule.body.rule._id}`).set(auth(A.token))).status).toBe(200);

    // Another pharmacy cannot check against A's patient or medicines
    const cross = await request(app).post('/api/interactions/check').set(auth(B.token))
      .send({ patientId: patient._id, medicineIds: [warfarin._id, combo._id] });
    expect(cross.status).toBe(404);
    const cross2 = await request(app).post('/api/interactions/check').set(auth(B.token))
      .send({ medicineIds: [warfarin._id, combo._id] });
    expect(cross2.body.interactions).toEqual([]);
  });
});
