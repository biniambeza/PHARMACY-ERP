// POS & shifts (Wave 3): pack units, tax, split payments, credit, controlled dispensing,
// offline sync, shifts / Z-report, void after shift close, mobile money, summary.
//
// Shift requirement: settings.requireShift is opt-in (missing = not required), so the
// pharmacies created by tests/helpers.js keep selling without a shift. Tests that need
// a shift open one through the API.
const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const Sale = require('../models/Sale');
const Pharmacy = require('../models/Pharmacy');
const StockBatch = require('../models/StockBatch');
const Customer = require('../models/Customer');
const ControlledEntry = require('../models/ControlledEntry');
const Shift = require('../models/Shift');

let A; // owner
let B; // other pharmacy
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

const sell = (token, body) => request(app).post('/api/sales').set(auth(token)).send(body);
const qtyOf = async (batch) => (await StockBatch.findById(batch._id)).quantity;
const setSettings = (pharmacyId, settings) =>
  Pharmacy.updateOne({ _id: pharmacyId }, { $set: Object.fromEntries(Object.entries(settings).map(([k, v]) => [`settings.${k}`, v])) });

const stocked = async (pharmacyId, overrides = {}, qty = 100, purchasePrice = 5) => {
  const med = await createMedicine(pharmacyId, overrides);
  const batch = await insertBatchRaw(pharmacyId, med._id, { quantity: qty, expiryDate: daysFromNow(200) });
  await StockBatch.updateOne({ _id: batch._id }, { $set: { purchasePrice } });
  return { med, batch };
};

beforeAll(async () => {
  await connectTestDb('pos');
  A = await createPharmacist();
  B = await createPharmacist();
  cashier = await addStaff(A, 'cashier');
  pharmacist = await addStaff(A, 'pharmacist');
});

afterAll(disconnectTestDb);

describe('Pack units and cost price', () => {
  test('selling 2 strips of 10 deducts 20 base units at the pack price and stores costPrice', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, {
      price: 2, baseUnit: 'tablet', packUnits: [{ name: 'strip', factor: 10, price: 18 }],
    }, 100, 1.25);

    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 2, unitName: 'strip' }], paymentMethod: 'cash' });
    expect(res.status).toBe(201);
    expect(await qtyOf(batch)).toBe(80);
    const item = res.body.sale.items[0];
    expect(item.quantity).toBe(20);
    expect(item.unitName).toBe('strip');
    expect(item.unitFactor).toBe(10);
    expect(item.unitPrice).toBe(1.8);
    expect(item.subtotal).toBe(36);
    expect(item.costPrice).toBe(1.25);
    expect(res.body.sale.subtotal).toBe(36);
    expect(res.body.sale.grandTotal).toBe(36);
  });

  test('unknown unit is rejected without touching stock', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, { packUnits: [{ name: 'box', factor: 100 }] });
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1, unitName: 'crate' }] });
    expect(res.status).toBe(400);
    expect(await qtyOf(batch)).toBe(100);
  });

  test('pack without its own price uses unit price x factor; stock check is in base units', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, { price: 3, packUnits: [{ name: 'box', factor: 30 }] }, 50);
    const ok = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1, unitName: 'box' }] });
    expect(ok.status).toBe(201);
    expect(ok.body.sale.grandTotal).toBe(90);
    const tooMany = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1, unitName: 'box' }] });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await qtyOf(batch)).toBe(20);
  });
});

describe('Tax and discount', () => {
  let T;
  beforeAll(async () => {
    T = await createPharmacist();
  });

  test('exclusive tax is added on top of the discounted total; exempt items are untaxed', async () => {
    await setSettings(T.pharmacy._id, { tax: { enabled: true, name: 'VAT', rate: 15, inclusive: false } });
    const { med } = await stocked(T.pharmacy._id, { price: 100 });
    const { med: exempt } = await stocked(T.pharmacy._id, { price: 50, taxExempt: true });
    const res = await sell(T.token, {
      items: [{ medicineId: med._id, quantity: 1 }, { medicineId: exempt._id, quantity: 1 }],
      discount: 15,
      payments: [{ method: 'cash', amount: 200 }],
    });
    expect(res.status).toBe(201);
    const s = res.body.sale;
    // discount split 10 / 5 -> taxable 90 -> VAT 13.5
    expect(s.subtotal).toBe(150);
    expect(s.tax).toBe(13.5);
    expect(s.taxLines).toEqual([expect.objectContaining({ name: 'VAT', rate: 15, amount: 13.5 })]);
    expect(s.grandTotal).toBe(148.5);
    expect(s.change).toBe(51.5);
    expect(s.items.find((i) => i.medicineId === String(exempt._id)).taxAmount).toBe(0);
  });

  test('inclusive tax is stored but not added', async () => {
    await setSettings(T.pharmacy._id, { tax: { enabled: true, name: 'VAT', rate: 15, inclusive: true } });
    const { med } = await stocked(T.pharmacy._id, { price: 115 });
    const res = await sell(T.token, { items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'cash' });
    expect(res.status).toBe(201);
    expect(res.body.sale.grandTotal).toBe(115);
    expect(res.body.sale.tax).toBe(15);
    expect(res.body.sale.items[0].taxAmount).toBe(15);
  });

  test('maxDiscountPercent is enforced', async () => {
    await setSettings(T.pharmacy._id, { maxDiscountPercent: 10, tax: { enabled: false } });
    const { med, batch } = await stocked(T.pharmacy._id, { price: 100 });
    const bad = await sell(T.token, { items: [{ medicineId: med._id, quantity: 1 }], discount: 11 });
    expect(bad.status).toBe(400);
    expect(await qtyOf(batch)).toBe(100);
    const ok = await sell(T.token, { items: [{ medicineId: med._id, quantity: 1 }], discount: 10 });
    expect(ok.status).toBe(201);
    expect(ok.body.sale.grandTotal).toBe(90);
  });
});

describe('Split payments', () => {
  test('card + cash with change: applied amounts sum to the total', async () => {
    const { med } = await stocked(A.pharmacy._id, { price: 40 });
    const res = await sell(A.token, {
      items: [{ medicineId: med._id, quantity: 2 }],
      payments: [{ method: 'card', amount: 50, reference: 'POS-1' }, { method: 'cash', amount: 50 }],
    });
    expect(res.status).toBe(201);
    const s = res.body.sale;
    expect(s.grandTotal).toBe(80);
    expect(s.change).toBe(20);
    expect(s.amountTendered).toBe(50);
    expect(s.amountPaid).toBe(80);
    expect(s.paymentStatus).toBe('paid');
    const byMethod = Object.fromEntries(s.payments.map((p) => [p.method, p.amount]));
    expect(byMethod).toEqual({ card: 50, cash: 30 });
  });

  test('payments that do not cover the total, or non-cash overpayment, are rejected', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, { price: 40 });
    const short = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'cash', amount: 30 }] });
    expect(short.status).toBe(400);
    const over = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'card', amount: 50 }] });
    expect(over.status).toBe(400);
    expect(await qtyOf(batch)).toBe(100);
  });

  test('legacy mobile money without reference still works; split mobile money needs a reference', async () => {
    const { med } = await stocked(A.pharmacy._id, { price: 10 });
    const legacy = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'mobile_money' });
    expect(legacy.status).toBe(201);
    const noRef = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 10 }] });
    expect(noRef.status).toBe(400);
    const withRef = await sell(A.token, {
      items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 10, reference: 'TB123' }],
    });
    expect(withRef.status).toBe(201);
    expect(withRef.body.sale.payments[0]).toEqual(expect.objectContaining({ reference: 'TB123', provider: 'manual' }));
  });
});

describe('Credit sales', () => {
  let customer;
  beforeAll(async () => {
    customer = await Customer.create({ pharmacyId: A.pharmacy._id, name: `Cust ${uid()}`, creditLimit: 100 });
  });

  test('cash + credit split puts the credit portion on the account', async () => {
    const { med } = await stocked(A.pharmacy._id, { price: 50 });
    const res = await sell(A.token, {
      items: [{ medicineId: med._id, quantity: 2 }],
      customerId: customer._id,
      payments: [{ method: 'cash', amount: 40 }, { method: 'credit', amount: 60 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.sale.balanceDue).toBe(60);
    expect(res.body.sale.amountPaid).toBe(40);
    expect(res.body.sale.paymentStatus).toBe('partial');
    expect(res.body.sale.customer.name).toBe(customer.name);
    expect((await Customer.findById(customer._id)).balance).toBe(60);
  });

  test('over the limit is rejected before any stock is touched', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, { price: 50 });
    const res = await sell(A.token, {
      items: [{ medicineId: med._id, quantity: 1 }], customerId: customer._id, paymentMethod: 'credit',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/limit/i);
    expect(await qtyOf(batch)).toBe(100);
    expect((await Customer.findById(customer._id)).balance).toBe(60);
  });

  test('credit needs a customer and the credit:sell permission', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, { price: 5 });
    const noCustomer = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'credit' });
    expect(noCustomer.status).toBe(400);
    const asCashier = await sell(cashier.token, {
      items: [{ medicineId: med._id, quantity: 1 }], customerId: customer._id, paymentMethod: 'credit',
    });
    expect(asCashier.status).toBe(403);
    expect(await qtyOf(batch)).toBe(100);
  });
});

describe('Controlled medicines', () => {
  let med;
  let batch;
  let patient;
  let rxId;

  beforeAll(async () => {
    ({ med, batch } = await stocked(A.pharmacy._id, { genericName: 'Morphine', isControlled: true, requiresPrescription: true }, 30));
    const p = await request(app).post('/api/patients').set(auth(A.token)).send({ name: `Patient ${uid()}`, age: 50 });
    patient = p.body.patient;
    const rx = await request(app).post('/api/prescriptions').set(auth(A.token))
      .send({ patientId: patient._id, prescriberName: 'Dr. Who', issueDate: new Date(), items: [{ medicineId: med._id, quantityPrescribed: 10 }] });
    expect(rx.status).toBe(201);
    rxId = rx.body.prescription._id;
  });

  test('requires a patient and a prescription', async () => {
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], prescription: { number: 'X', prescriber: 'Y' } });
    expect(res.status).toBe(400);
    expect(await qtyOf(batch)).toBe(30);
  });

  test('cashiers cannot dispense controlled medicines', async () => {
    const res = await sell(cashier.token, { items: [{ medicineId: med._id, quantity: 1 }], patientId: patient._id, prescriptionId: rxId });
    expect(res.status).toBe(403);
    expect(await qtyOf(batch)).toBe(30);
  });

  test('a sale with patient + prescription writes the register and updates the prescription', async () => {
    const res = await sell(pharmacist.token, { items: [{ medicineId: med._id, quantity: 4 }], patientId: patient._id, prescriptionId: rxId });
    expect(res.status).toBe(201);
    expect(String(res.body.sale.patientId._id || res.body.sale.patientId)).toBe(String(patient._id));
    const entries = await ControlledEntry.find({ saleId: res.body.sale._id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0].quantityOut).toBe(4);
    expect(entries[0].balanceAfter).toBe(26);
    const rx = await mongoose.model('Prescription').findById(rxId).lean();
    expect(rx.items[0].quantityDispensed).toBe(4);
  });
});

describe('Offline sync', () => {
  test('is idempotent and reports per-item failures', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, { price: 10 }, 5);
    const { med: ctrl } = await stocked(A.pharmacy._id, { isControlled: true }, 5);
    const customer = await Customer.create({ pharmacyId: A.pharmacy._id, name: `Off ${uid()}`, creditLimit: null });
    const ok = { offlineId: `off-${uid()}`, createdAtClient: new Date(Date.now() - 60000).toISOString(), payload: { items: [{ medicineId: med._id, quantity: 2 }], payments: [{ method: 'cash', amount: 20 }] } };
    const tooMuch = { offlineId: `off-${uid()}`, payload: { items: [{ medicineId: med._id, quantity: 10 }], paymentMethod: 'cash' } };
    const credit = { offlineId: `off-${uid()}`, payload: { items: [{ medicineId: med._id, quantity: 1 }], customerId: customer._id, paymentMethod: 'credit' } };
    const controlled = { offlineId: `off-${uid()}`, payload: { items: [{ medicineId: ctrl._id, quantity: 1 }], paymentMethod: 'cash' } };

    const res = await request(app).post('/api/sales/sync').set(auth(A.token)).send({ sales: [ok, tooMuch, credit, controlled] });
    expect(res.status).toBe(200);
    const [r1, r2, r3, r4] = res.body.results;
    expect(r1.status).toBe('created');
    expect(r2).toEqual(expect.objectContaining({ status: 'failed', code: 'INSUFFICIENT_STOCK' }));
    expect(r3).toEqual(expect.objectContaining({ status: 'failed', code: 'OFFLINE_PAYMENT_NOT_ALLOWED' }));
    expect(r4).toEqual(expect.objectContaining({ status: 'failed', code: 'OFFLINE_CONTROLLED' }));
    expect(res.body.summary).toEqual({ created: 1, duplicate: 0, failed: 3 });
    expect(await qtyOf(batch)).toBe(3);
    const sale = await Sale.findById(r1.saleId).lean();
    expect(sale.offlineId).toBe(ok.offlineId);
    expect(sale.offlineCreatedAt).toBeTruthy();

    // Re-sync (e.g. response lost): no second sale, no second stock deduction
    const again = await request(app).post('/api/sales/sync').set(auth(A.token)).send({ sales: [ok] });
    expect(again.body.results[0]).toEqual(expect.objectContaining({ status: 'duplicate', saleId: r1.saleId }));
    expect(await qtyOf(batch)).toBe(3);
    // The normal endpoint is idempotent by offlineId as well
    const direct = await sell(A.token, { ...ok.payload, offlineId: ok.offlineId });
    expect(direct.status).toBe(200);
    expect(direct.body.duplicate).toBe(true);
    expect(await Sale.countDocuments({ pharmacyId: A.pharmacy._id, offlineId: ok.offlineId })).toBe(1);
  });

  test('concurrent syncs of the same offline sale create it once', async () => {
    const { med, batch } = await stocked(A.pharmacy._id, { price: 10 }, 10);
    const entry = { offlineId: `off-${uid()}`, payload: { items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'cash' } };
    const results = await Promise.all([1, 2, 3].map(() => request(app).post('/api/sales/sync').set(auth(A.token)).send({ sales: [entry] })));
    const statuses = results.map((r) => r.body.results[0].status);
    expect(statuses.filter((s) => s === 'created')).toHaveLength(1);
    expect(await qtyOf(batch)).toBe(9);
  });
});

describe('Shifts', () => {
  let S; // own pharmacy so totals are isolated
  let S_cashier;

  beforeAll(async () => {
    S = await createPharmacist();
    S_cashier = await addStaff(S, 'cashier');
  });

  test('requireShift blocks sales until a shift is opened; one open shift per user', async () => {
    await setSettings(S.pharmacy._id, { requireShift: true });
    const { med } = await stocked(S.pharmacy._id, { price: 10 });
    const blocked = await sell(S_cashier.token, { items: [{ medicineId: med._id, quantity: 1 }] });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('SHIFT_REQUIRED');

    const cur = await request(app).get('/api/shifts/current').set(auth(S_cashier.token));
    expect(cur.body).toEqual(expect.objectContaining({ shift: null, requireShift: true }));

    const open = await request(app).post('/api/shifts/open').set(auth(S_cashier.token)).send({ openingFloat: 100 });
    expect(open.status).toBe(201);
    expect(open.body.shift.shiftNumber).toMatch(/^SH-\d{4}-\d{6}$/);
    const second = await request(app).post('/api/shifts/open').set(auth(S_cashier.token)).send({ openingFloat: 0 });
    expect(second.status).toBe(400);

    const ok = await sell(S_cashier.token, { items: [{ medicineId: med._id, quantity: 1 }] });
    expect(ok.status).toBe(201);
    expect(String(ok.body.sale.shiftId._id || ok.body.sale.shiftId)).toBe(String(open.body.shift._id));
  });

  test('close computes expected cash incl. customer payments and cash refunds; void blocked after close', async () => {
    const shift = await Shift.findOne({ pharmacyId: S.pharmacy._id, status: 'open' });
    const { med } = await stocked(S.pharmacy._id, { price: 25 });

    // cash 50 (tendered 100), card 25, credit 25
    const customer = await Customer.create({ pharmacyId: S.pharmacy._id, name: `C ${uid()}`, creditLimit: null });
    const s1 = await sell(S_cashier.token, { items: [{ medicineId: med._id, quantity: 2 }], payments: [{ method: 'cash', amount: 100 }] });
    expect(s1.status).toBe(201);
    const s2 = await sell(S_cashier.token, { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'card', amount: 25 }] });
    expect(s2.status).toBe(201);
    // Owner sells on credit to the customer (cashier lacks credit:sell); owner has no open shift
    const s3 = await sell(S.token, { items: [{ medicineId: med._id, quantity: 1 }], customerId: customer._id, paymentMethod: 'credit' });
    expect(s3.status).toBe(400); // owner needs a shift too in this pharmacy
    await request(app).post('/api/shifts/open').set(auth(S.token)).send({ openingFloat: 0 });
    const s3b = await sell(S.token, { items: [{ medicineId: med._id, quantity: 1 }], customerId: customer._id, paymentMethod: 'credit' });
    expect(s3b.status).toBe(201);

    // A sale that gets voided is excluded
    const s4 = await sell(S_cashier.token, { items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'cash' });
    const v = await request(app).post(`/api/returns/void/${s4.body.sale._id}`).set(auth(S.token)).send({ reason: 'mistake' });
    expect(v.status).toBe(200);

    // Cash refund processed by the cashier? cashiers lack sales:return -> owner refunds; give the cashier a
    // customer payment instead and record a cash refund through the Return model for the cashier.
    const Return = mongoose.model('Return');
    await Return.create({
      pharmacyId: S.pharmacy._id, saleId: s1.body.sale._id, returnNumber: `RET-T-${uid()}`, reason: 'test',
      items: [{ saleItemId: s1.body.sale.items[0]._id, medicineId: med._id, name: med.name, batchId: s1.body.sale.items[0].batchId, quantity: 1, unitPrice: 25, refundAmount: 25 }],
      refundMethod: 'cash', refundTotal: 25, refundDue: 25, processedBy: S_cashier._id,
    });
    const CustomerPayment = mongoose.model('CustomerPayment');
    await CustomerPayment.create({
      pharmacyId: S.pharmacy._id, customerId: customer._id, paymentNo: `PAY-T-${uid()}`, amount: 10, method: 'cash', receivedBy: S_cashier._id,
    });

    const live = await request(app).get('/api/shifts/current').set(auth(S_cashier.token));
    // float 100 + cash sales (10 from first test + 50) + customer payment 10 - refund 25
    expect(live.body.shift.expected.cash).toBe(145);

    const close = await request(app).post(`/api/shifts/${shift._id}/close`).set(auth(S_cashier.token))
      .send({ counted: { cash: 140, card: 25, mobile_money: 0 }, notes: 'short 5' });
    expect(close.status).toBe(200);
    const closed = close.body.shift;
    expect(closed.status).toBe('closed');
    expect(closed.expected).toEqual(expect.objectContaining({
      cash: 145, cashSales: 60, customerPaymentsCash: 10, refundsCash: 25, card: 25, credit: 0,
    }));
    expect(closed.variance.cash).toBe(-5);
    expect(closed.variance.card).toBe(0);
    expect(close.body.zReport.sales.count).toBe(3);
    expect(close.body.zReport.voids.count).toBe(1);

    const z = await request(app).get(`/api/shifts/${shift._id}/z-report`).set(auth(S_cashier.token));
    expect(z.status).toBe(200);
    expect(z.body.zReport.expected.cash).toBe(145);

    // Closing twice fails
    const again = await request(app).post(`/api/shifts/${shift._id}/close`).set(auth(S_cashier.token)).send({ counted: {} });
    expect(again.status).toBe(400);

    // Void after the shift is closed is blocked (same day)
    const vClosed = await request(app).post(`/api/returns/void/${s2.body.sale._id}`).set(auth(S.token)).send({ reason: 'late' });
    expect(vClosed.status).toBe(400);
    expect(vClosed.body.message).toBe('Shift already closed');
  });

  test('history: cashier sees own shifts, owner sees all; other pharmacies see nothing', async () => {
    const own = await request(app).get('/api/shifts').set(auth(S_cashier.token));
    expect(own.status).toBe(200);
    expect(own.body.shifts.every((s) => String(s.userId._id) === String(S_cashier._id))).toBe(true);
    const all = await request(app).get('/api/shifts').set(auth(S.token));
    expect(all.body.shifts.length).toBeGreaterThan(own.body.shifts.length);
    const ownerShift = all.body.shifts.find((s) => String(s.userId._id) === String(S.user._id));
    const forbidden = await request(app).get(`/api/shifts/${ownerShift._id}`).set(auth(S_cashier.token));
    expect(forbidden.status).toBe(404);
    const other = await request(app).get(`/api/shifts/${ownerShift._id}`).set(auth(B.token));
    expect(other.status).toBe(404);
  });
});

describe('Mobile money provider flow', () => {
  const OLD = { ...process.env };
  afterAll(() => {
    process.env = OLD;
  });

  test('manual intent requires a reference and confirms immediately', async () => {
    const bad = await request(app).post('/api/payments/intents').set(auth(A.token)).send({ amount: 10, provider: 'manual' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/payments/intents').set(auth(A.token)).send({ amount: 10, provider: 'manual', reference: 'M-1' });
    expect(ok.status).toBe(201);
    expect(ok.body.intent.status).toBe('confirmed');
  });

  test('unconfigured provider throws "not configured"', async () => {
    delete process.env.TELEBIRR_API_KEY;
    const res = await request(app).post('/api/payments/intents').set(auth(A.token)).send({ amount: 10, provider: 'telebirr', phone: '0911000000' });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/not configured/);
  });

  test('pending -> webhook confirm -> used once by a sale', async () => {
    process.env.TELEBIRR_API_KEY = 'k';
    process.env.TELEBIRR_WEBHOOK_SECRET = 'shh';
    const { med } = await stocked(A.pharmacy._id, { price: 30 });
    const created = await request(app).post('/api/payments/intents').set(auth(A.token)).send({ amount: 30, provider: 'telebirr', phone: '0911000000' });
    expect(created.status).toBe(201);
    const intent = created.body.intent;
    expect(intent.status).toBe('pending');

    const early = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 30, intentId: intent._id }] });
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('PAYMENT_NOT_CONFIRMED');

    const badSig = await request(app).post('/api/payments/webhook/telebirr').set('x-webhook-secret', 'nope')
      .send({ providerRef: intent.providerRef, status: 'success' });
    expect(badSig.status).toBe(401);
    const hook = await request(app).post('/api/payments/webhook/telebirr').set('x-webhook-secret', 'shh')
      .send({ providerRef: intent.providerRef, status: 'success', amount: 30 });
    expect(hook.status).toBe(200);
    const status = await request(app).get(`/api/payments/intents/${intent._id}`).set(auth(A.token));
    expect(status.body.intent.status).toBe('confirmed');

    const paid = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 30, intentId: intent._id }] });
    expect(paid.status).toBe(201);
    expect(paid.body.sale.payments[0]).toEqual(expect.objectContaining({ provider: 'telebirr', reference: intent.providerRef }));
    const reuse = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }], payments: [{ method: 'mobile_money', amount: 30, intentId: intent._id }] });
    expect(reuse.status).toBe(400);
    // Other pharmacies cannot see the intent
    expect((await request(app).get(`/api/payments/intents/${intent._id}`).set(auth(B.token))).status).toBe(404);
  });
});

describe('Summary, catalog and quick picks', () => {
  test('summary excludes voided sales and subtracts returns', async () => {
    const P = await createPharmacist();
    const { med } = await stocked(P.pharmacy._id, { price: 10 });
    const s1 = await sell(P.token, { items: [{ medicineId: med._id, quantity: 3 }] });
    const s2 = await sell(P.token, { items: [{ medicineId: med._id, quantity: 2 }] });
    await sell(P.token, { items: [{ medicineId: med._id, quantity: 1 }] });
    expect((await request(app).post(`/api/returns/void/${s2.body.sale._id}`).set(auth(P.token)).send({ reason: 'x' })).status).toBe(200);
    const ret = await request(app).post('/api/returns').set(auth(P.token))
      .send({ saleId: s1.body.sale._id, reason: 'r', items: [{ saleItemId: s1.body.sale.items[0]._id, quantity: 1 }] });
    expect(ret.status).toBe(201);

    const res = await request(app).get('/api/sales/summary').set(auth(P.token));
    expect(res.status).toBe(200);
    expect(res.body.summary.totalSalesCount).toBe(2);
    expect(res.body.summary.totalRevenue).toBe(30); // 30 + 10 - 10 refunded
    expect(res.body.summary.todayRevenue).toBe(30);
  });

  test('POS catalog returns sellable stock; top items rank by sales', async () => {
    const P = await createPharmacist();
    const { med } = await stocked(P.pharmacy._id, { price: 10 }, 40);
    await insertBatchRaw(P.pharmacy._id, med._id, { quantity: 99, expiryDate: daysFromNow(-1) });
    await sell(P.token, { items: [{ medicineId: med._id, quantity: 5 }] });
    const cat = await request(app).get('/api/sales/pos-catalog').set(auth(P.token));
    expect(cat.status).toBe(200);
    expect(cat.body.medicines.find((m) => m._id === String(med._id)).stock).toBe(35);
    const top = await request(app).get('/api/sales/top-items').set(auth(P.token));
    expect(top.body.items[0]).toEqual(expect.objectContaining({ medicineId: String(med._id), quantity: 5, salesCount: 1 }));
  });
});
