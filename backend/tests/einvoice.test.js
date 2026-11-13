const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');

const FiscalInvoice = require('../models/FiscalInvoice');
const Sale = require('../models/Sale');
const AuditLog = require('../models/AuditLog');
const einvoice = require('../services/einvoice');
const { buildSalePayload, validatePayload } = require('../services/einvoice/payload');

let A; // owner of pharmacy A
let B; // owner of pharmacy B
let pharmacistToken; // non-owner staff of A

const TIN = '0012345678';

const addStaff = async (owner, role) => {
  const email = `${role}_${uid()}@example.com`;
  const created = await request(app).post('/api/staff').set(auth(owner.token))
    .send({ name: role, email, password: PASSWORD, role });
  expect(created.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return login.body.token;
};

const makeSale = async (owner, { price = 10, qty = 2, discount = 0 } = {}) => {
  const med = await createMedicine(owner.pharmacy._id, { price });
  await insertBatchRaw(owner.pharmacy._id, med._id, { quantity: 50, expiryDate: daysFromNow(300) });
  const res = await request(app).post('/api/sales').set(auth(owner.token))
    .send({ paymentMethod: 'cash', discount, items: [{ medicineId: med._id, quantity: qty }] });
  expect(res.status).toBe(201);
  return res.body.sale;
};

const putSettings = (token, body) => request(app).put('/api/einvoice/settings').set(auth(token)).send(body);

beforeAll(async () => {
  await connectTestDb('einvoice');
  A = await createPharmacist();
  B = await createPharmacist();
  pharmacistToken = await addStaff(A, 'pharmacist');
  // 15% VAT, exclusive
  const tax = await request(app).put('/api/pharmacy/my-pharmacy').set(auth(A.token))
    .send({ settings: { tax: { enabled: true, rate: 15, inclusive: false } } });
  expect(tax.status).toBe(200);
});

afterAll(disconnectTestDb);

describe('settings', () => {
  test('owner can read and update; non-owner can read but not update', async () => {
    const get = await request(app).get('/api/einvoice/settings').set(auth(pharmacistToken));
    expect(get.status).toBe(200);
    expect(get.body.settings).toMatchObject({ enabled: false, provider: 'none', mode: 'sandbox' });
    expect(get.body.settings.providers.map((p) => p.name)).toEqual(['none', 'mock', 'mor']);

    const denied = await putSettings(pharmacistToken, { tin: TIN });
    expect(denied.status).toBe(403);

    const ok = await putSettings(A.token, { tin: TIN, vatRegNo: 'VAT-1', vatRegistered: true, enabled: true, provider: 'mock' });
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toMatchObject({ enabled: true, provider: 'mock', tin: TIN, vatRegistered: true });
    expect(await AuditLog.exists({ action: 'einvoice.settings_update', pharmacyId: A.pharmacy._id })).toBeTruthy();
  });

  test('rejects mock provider in production mode and invalid values', async () => {
    expect((await putSettings(A.token, { mode: 'production' })).status).toBe(400);
    expect((await putSettings(A.token, { provider: 'fancy' })).status).toBe(400);
    expect((await putSettings(A.token, { tin: 'bad tin!' })).status).toBe(400);
  });

  test('cashier has no access', async () => {
    const cashier = await addStaff(A, 'cashier');
    expect((await request(app).get('/api/einvoice/settings').set(auth(cashier))).status).toBe(403);
  });
});

describe('submission with the mock provider', () => {
  test('submits a sale and gets a deterministic MOCK fiscal number', async () => {
    const sale = await makeSale(A, { price: 10, qty: 3, discount: 2 });
    const res = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(pharmacistToken));
    expect(res.status).toBe(200);
    const inv = res.body.invoice;
    expect(inv.status).toBe('accepted');
    expect(inv.provider).toBe('mock');
    expect(inv.fiscalNumber).toMatch(/^MOCK-[0-9A-F]{12}$/);
    expect(inv.qrPayload).toContain('TEST-ONLY');
    expect(inv.attempts).toBe(1);
    expect(inv.payload.seller.tin).toBe(TIN);
    expect(inv.payload.totals.grandTotal).toBe(sale.grandTotal);
    expect(inv.payload.totals.taxTotal).toBe(sale.tax);
    expect(inv.payload.taxLines[0]).toMatchObject({ name: 'VAT', rate: 15 });

    // Already accepted: cannot be submitted twice
    const again = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(A.token));
    expect(again.status).toBe(409);

    // Detail endpoint
    const detail = await request(app).get(`/api/einvoice/${sale._id}`).set(auth(A.token));
    expect(detail.status).toBe(200);
    expect(detail.body.invoice.fiscalNumber).toBe(inv.fiscalNumber);

    // Deterministic: same payload -> same number
    const { MOCK_PREFIX, PROVIDERS } = require('../services/einvoice/providers');
    const second = await PROVIDERS.mock.submit(inv.payload);
    expect(second.fiscalNumber).toBe(inv.fiscalNumber);
    expect(inv.fiscalNumber.startsWith(MOCK_PREFIX)).toBe(true);
  });

  test('list shows fiscal status and filters', async () => {
    const sale = await makeSale(A);
    // New sales are queued as 'pending' automatically while e-invoicing is enabled
    const list = await request(app).get('/api/einvoice').query({ status: 'pending' }).set(auth(A.token));
    expect(list.status).toBe(200);
    expect(list.body.sales.some((s) => String(s._id) === String(sale._id))).toBe(true);
    expect(list.body.sales.every((s) => s.fiscalStatus === 'pending')).toBe(true);
    expect(list.body.counts.accepted).toBeGreaterThanOrEqual(1);

    const accepted = await request(app).get('/api/einvoice').query({ status: 'accepted' }).set(auth(A.token));
    expect(accepted.body.sales.length).toBeGreaterThanOrEqual(1);
    expect(accepted.body.sales.every((s) => s.fiscal && s.fiscal.status === 'accepted')).toBe(true);

    expect((await request(app).get('/api/einvoice').query({ status: 'nope' }).set(auth(A.token))).status).toBe(400);
  });

  test('missing seller TIN fails validation; retry-failed succeeds once fixed', async () => {
    const sale = await makeSale(A);
    // Remove TIN directly (the API refuses to enable without one)
    const Pharmacy = require('../models/Pharmacy');
    await Pharmacy.updateOne({ _id: A.pharmacy._id }, { $set: { tin: '' } });

    const res = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(A.token));
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Seller TIN is missing/);
    expect(res.body.invoice.status).toBe('failed');
    expect(res.body.invoice.attempts).toBe(1);

    await Pharmacy.updateOne({ _id: A.pharmacy._id }, { $set: { tin: TIN } });
    const retry = await request(app).post('/api/einvoice/retry-failed').set(auth(A.token)).send({});
    expect(retry.status).toBe(200);
    expect(retry.body.summary.accepted).toBeGreaterThanOrEqual(1);
    const rec = await FiscalInvoice.findOne({ saleId: sale._id });
    expect(rec.status).toBe('accepted');
    expect(rec.attempts).toBe(2);

    // Batches are owner-only
    expect((await request(app).post('/api/einvoice/retry-failed').set(auth(pharmacistToken))).status).toBe(403);
  });

  test('mock provider rejects a non 10-digit TIN', async () => {
    await putSettings(A.token, { tin: 'ABC-123' });
    const sale = await makeSale(A);
    const res = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(A.token));
    expect(res.status).toBe(422);
    expect(res.body.invoice.status).toBe('rejected');
    await putSettings(A.token, { tin: TIN });
    // Rejected documents can be re-submitted after fixing the data
    const again = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(A.token));
    expect(again.status).toBe(200);
    expect(again.body.invoice.status).toBe('accepted');
  });

  test('submit-pending processes sales in a date range', async () => {
    const s1 = await makeSale(A);
    const s2 = await makeSale(A);
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app).post('/api/einvoice/submit-pending').set(auth(A.token))
      .send({ from: today, to: today });
    expect(res.status).toBe(200);
    expect(res.body.summary.accepted).toBeGreaterThanOrEqual(2);
    for (const s of [s1, s2]) {
      expect((await FiscalInvoice.findOne({ saleId: s._id })).status).toBe('accepted');
    }
    expect((await request(app).post('/api/einvoice/submit-pending').set(auth(A.token)).send({})).status).toBe(400);
  });

  test('credit note for a return references the original invoice', async () => {
    const sale = await makeSale(A, { qty: 4 });
    await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(A.token));
    const ret = await request(app).post('/api/returns').set(auth(A.token))
      .send({ saleId: sale._id, reason: 'Damaged', refundMethod: 'cash', items: [{ saleItemId: sale.items[0]._id, quantity: 1 }] });
    expect(ret.status).toBe(201);
    const res = await request(app).post(`/api/einvoice/credit-note/${ret.body.return._id}`).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.invoice.type).toBe('credit_note');
    expect(res.body.invoice.status).toBe('accepted');
    expect(res.body.invoice.payload.originalInvoice.invoiceNumber).toBe(sale.invoiceNumber);
    expect(res.body.invoice.payload.lines[0].quantity).toBe(1);
  });
});

describe('providers', () => {
  test("'none' marks documents not_required", async () => {
    await putSettings(A.token, { provider: 'none' });
    const sale = await makeSale(A);
    const res = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.invoice.status).toBe('not_required');
    await putSettings(A.token, { provider: 'mock' });
  });

  test("'mor' refuses to submit without official configuration", async () => {
    await putSettings(A.token, { provider: 'mor' });
    const sale = await makeSale(A);
    const res = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(A.token));
    expect(res.status).toBe(503);
    expect(res.body.invoice.status).toBe('failed');
    expect(res.body.message).toMatch(/not configured/);
    await putSettings(A.token, { provider: 'mock' });
  });

  test('disabled e-invoicing refuses submission', async () => {
    const sale = await makeSale(B);
    const res = await request(app).post(`/api/einvoice/submit/${sale._id}`).set(auth(B.token));
    expect(res.status).toBe(400);
  });
});

describe('payload validation', () => {
  test('detects totals that do not match the lines', async () => {
    const sale = await Sale.findOne({ pharmacyId: A.pharmacy._id }).lean();
    const Pharmacy = require('../models/Pharmacy');
    const pharmacy = await Pharmacy.findById(A.pharmacy._id).lean();
    const payload = buildSalePayload({ pharmacy, sale });
    expect(validatePayload(payload)).toEqual([]);
    payload.totals.grandTotal += 5;
    payload.lines[0].taxAmount += 3;
    const errors = validatePayload(payload);
    expect(errors.join(' ')).toMatch(/sum of the lines/);
    expect(errors.join(' ')).toMatch(/tax/i);
  });
});

describe('queueForSale', () => {
  test('creates one pending record per sale when enabled, none when disabled', async () => {
    const sale = await makeSale(A);
    const doc = await Sale.findById(sale._id);
    const first = await einvoice.queueForSale(doc);
    const second = await einvoice.queueForSale(doc);
    expect(first.status).toBe('pending');
    expect(String(first._id)).toBe(String(second._id));

    const saleB = await Sale.findById((await makeSale(B))._id);
    expect(await einvoice.queueForSale(saleB)).toBeNull();
  });

  test('a POS sale is queued automatically when e-invoicing is enabled', async () => {
    const sale = await makeSale(A);
    const fi = await FiscalInvoice.findOne({ pharmacyId: A.pharmacy._id, saleId: sale._id, type: 'invoice' });
    expect(fi).not.toBeNull();
    expect(fi.status).toBe('pending');
  });
});

describe('tenant isolation', () => {
  test("cannot submit or read another pharmacy's sale", async () => {
    const saleA = await makeSale(A);
    await putSettings(B.token, { tin: '0099999999', enabled: true, provider: 'mock' });
    expect((await request(app).post(`/api/einvoice/submit/${saleA._id}`).set(auth(B.token))).status).toBe(404);
    expect((await request(app).get(`/api/einvoice/${saleA._id}`).set(auth(B.token))).status).toBe(404);
    const list = await request(app).get('/api/einvoice').set(auth(B.token));
    expect(list.body.sales.some((s) => String(s._id) === String(saleA._id))).toBe(false);
    // B's retry batch never touches A's failed records
    const retry = await request(app).post('/api/einvoice/retry-failed').set(auth(B.token)).send({});
    expect(retry.body.summary.results.every((r) => String(r.saleId) !== String(saleA._id))).toBe(true);
  });
});
