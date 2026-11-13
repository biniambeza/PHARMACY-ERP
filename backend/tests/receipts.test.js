const mongoose = require('mongoose');
const {
  app, request, auth, uid, connectTestDb, disconnectTestDb, createPharmacist,
} = require('./helpers');
const Sale = require('../models/Sale');
const Pharmacy = require('../models/Pharmacy');
const AuditLog = require('../models/AuditLog');
const notify = require('../services/notify');
const receipts = require('../services/receipts');

let A; // owner of pharmacy A
let B; // owner of pharmacy B
let saleA;

const oid = () => new mongoose.Types.ObjectId();

const makeSale = (P, overrides = {}) =>
  Sale.create({
    pharmacyId: P.pharmacy._id,
    pharmacistId: P.user._id,
    staffId: P.user._id,
    invoiceNumber: `INV-${uid()}`,
    customer: { name: 'Abebe', phone: '0911223344' },
    items: [
      { medicineId: oid(), name: 'Paracetamol 500mg', batchId: oid(), batchNo: 'B1', quantity: 2, unitPrice: 10, subtotal: 20 },
      { medicineId: oid(), name: 'Amoxicillin 250mg', batchId: oid(), batchNo: 'B2', quantity: 20, unitPrice: 5, subtotal: 100, unitName: 'strip', unitFactor: 10 },
    ],
    subtotal: 120,
    discount: 5,
    tax: 0,
    grandTotal: 115,
    paymentMethod: 'cash',
    payments: [
      { method: 'cash', amount: 100 },
      { method: 'insurance', amount: 15, reference: 'CBHI-1' },
    ],
    amountPaid: 115,
    balanceDue: 0,
    amountTendered: 120,
    change: 20,
    ...overrides,
  });

beforeAll(async () => {
  await connectTestDb('receipts');
  A = await createPharmacist();
  B = await createPharmacist();
  await Pharmacy.updateOne(
    { _id: A.pharmacy._id },
    { $set: { 'settings.tax.registrationNo': 'TIN-0099', 'settings.receiptFooter': 'Get well soon' } }
  );
  saleA = await makeSale(A);
});

afterAll(disconnectTestDb);
afterEach(() => {
  jest.restoreAllMocks();
  receipts.resetSendRate();
});

describe('services/receipts', () => {
  test('buildReceiptText includes the key receipt fields', () => {
    const text = receipts.buildReceiptText({
      sale: saleA.toObject(),
      pharmacy: { name: 'Test Pharmacy', address: 'Bole', phone: '0111', settings: { currency: 'ETB', tax: { registrationNo: 'T1' } } },
    });
    expect(text).toContain('Test Pharmacy');
    expect(text).toContain('TIN: T1');
    expect(text).toContain(saleA.invoiceNumber);
    expect(text).toContain('Paracetamol 500mg x2 ETB 20.00');
    expect(text).toContain('Amoxicillin 250mg x2 strip ETB 100.00');
    expect(text).toContain('Discount: -ETB 5.00');
    expect(text).toContain('Total: ETB 115.00');
    expect(text).toContain('Paid: ETB 115.00');
    expect(text).toContain('Insurance: ETB 15.00');
    expect(text).toContain('Change: ETB 20.00');
    expect(text).not.toContain('Balance due');
  });

  test('compact text limits items and shows balance / status', () => {
    const sale = {
      ...saleA.toObject(),
      balanceDue: 40,
      voided: true,
      payments: [{ method: 'wallet_x', amount: 75 }],
      amountPaid: 75,
    };
    const text = receipts.buildReceiptText({ sale, pharmacy: { name: 'P', settings: {} }, compact: true, maxItems: 1 });
    expect(text).toContain('+1 more item(s)');
    expect(text).toContain('Balance due: ETB 40.00');
    expect(text).toContain('Status: VOIDED');
    expect(text.length).toBeLessThan(300);
  });

  test('phone / email validation', () => {
    expect(receipts.normalizePhone('0911 22 33 44')).toBe('0911223344');
    expect(receipts.normalizePhone('+251-911-223344')).toBe('+251911223344');
    expect(receipts.normalizePhone('12345')).toBeNull();
    expect(receipts.normalizePhone('call me')).toBeNull();
    expect(receipts.normalizePhone({ $ne: 1 })).toBeNull();
    expect(receipts.normalizeEmail(' A@B.com ')).toBe('a@b.com');
    expect(receipts.normalizeEmail('nope@')).toBeNull();
  });
});

describe('GET /api/receipts/:saleId/text', () => {
  test('returns the plain-text receipt with pharmacy settings', async () => {
    const res = await request(app).get(`/api/receipts/${saleA._id}/text`).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.text).toContain(saleA.invoiceNumber);
    expect(res.body.text).toContain('TIN: TIN-0099');
    expect(res.body.text).toContain('Get well soon');
  });

  test('is tenant-scoped', async () => {
    const res = await request(app).get(`/api/receipts/${saleA._id}/text`).set(auth(B.token));
    expect(res.status).toBe(404);
    const bad = await request(app).get('/api/receipts/not-an-id/text').set(auth(A.token));
    expect(bad.status).toBe(404);
  });

  test('requires authentication', async () => {
    const res = await request(app).get(`/api/receipts/${saleA._id}/text`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/receipts/:saleId/send', () => {
  test('sends an SMS through notify.sendSms and audits it', async () => {
    const spy = jest.spyOn(notify, 'sendSms').mockResolvedValue({ sent: true });
    const res = await request(app)
      .post(`/api/receipts/${saleA._id}/send`)
      .set(auth(A.token))
      .send({ channel: 'sms', to: '0911 223 344' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, sent: true, logged: false, to: '0911223344' });
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.to).toBe('0911223344');
    expect(arg.text).toContain(saleA.invoiceNumber);
    expect(arg.text).toContain('Total: ETB 115.00');
    expect(await AuditLog.exists({ action: 'receipt.send', entityId: saleA._id })).toBeTruthy();
  });

  test('email falls back to logged when SMTP is not configured', async () => {
    const spy = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: false, skipped: true });
    const res = await request(app)
      .post(`/api/receipts/${saleA._id}/send`)
      .set(auth(A.token))
      .send({ channel: 'email', to: 'Customer@Example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sent: false, logged: true, to: 'customer@example.com' });
    expect(spy.mock.calls[0][0].subject).toContain(saleA.invoiceNumber);
    expect(spy.mock.calls[0][0].text).toContain('Get well soon');
  });

  test('provider failure returns 502', async () => {
    jest.spyOn(notify, 'sendSms').mockResolvedValue({ sent: false });
    const res = await request(app)
      .post(`/api/receipts/${saleA._id}/send`)
      .set(auth(A.token))
      .send({ channel: 'sms', to: '0911223344' });
    expect(res.status).toBe(502);
  });

  test('rejects invalid phone, email and channel', async () => {
    const spy = jest.spyOn(notify, 'sendSms');
    const phone = await request(app).post(`/api/receipts/${saleA._id}/send`).set(auth(A.token))
      .send({ channel: 'sms', to: 'abc' });
    expect(phone.status).toBe(400);
    const email = await request(app).post(`/api/receipts/${saleA._id}/send`).set(auth(A.token))
      .send({ channel: 'email', to: 'not-an-email' });
    expect(email.status).toBe(400);
    const channel = await request(app).post(`/api/receipts/${saleA._id}/send`).set(auth(A.token))
      .send({ channel: 'fax', to: '0911223344' });
    expect(channel.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  test('cannot send another pharmacy\'s sale', async () => {
    const spy = jest.spyOn(notify, 'sendSms').mockResolvedValue({ sent: true });
    const res = await request(app).post(`/api/receipts/${saleA._id}/send`).set(auth(B.token))
      .send({ channel: 'sms', to: '0911223344' });
    expect(res.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  test('rate-limits sends per sale', async () => {
    const spy = jest.spyOn(notify, 'sendSms').mockResolvedValue({ sent: true });
    const send = () => request(app).post(`/api/receipts/${saleA._id}/send`).set(auth(A.token))
      .send({ channel: 'sms', to: '0911223344' });
    for (let i = 0; i < receipts.SEND_LIMIT; i += 1) {
      expect((await send()).status).toBe(200);
    }
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(receipts.SEND_LIMIT);

    // Other sales are not affected
    const other = await makeSale(A);
    const res = await request(app).post(`/api/receipts/${other._id}/send`).set(auth(A.token))
      .send({ channel: 'sms', to: '0911223344' });
    expect(res.status).toBe(200);
  });

  test('requires sales:view (storekeeper is forbidden)', async () => {
    const email = `store_${uid()}@example.com`;
    const created = await request(app).post('/api/staff').set(auth(A.token)).send({
      name: 'Store Keeper', email, password: 'TempPass123', role: 'storekeeper',
    });
    expect(created.status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ email, password: 'TempPass123' });
    expect(login.status).toBe(200);
    const token = login.body.token;

    const spy = jest.spyOn(notify, 'sendSms').mockResolvedValue({ sent: true });
    const res = await request(app).post(`/api/receipts/${saleA._id}/send`).set(auth(token))
      .send({ channel: 'sms', to: '0911223344' });
    expect(res.status).toBe(403);
    const text = await request(app).get(`/api/receipts/${saleA._id}/text`).set(auth(token));
    expect(text.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });
});
