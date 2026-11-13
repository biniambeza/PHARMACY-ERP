const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist,
} = require('./helpers');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const Sale = require('../models/Sale');
const SupplierInvoice = require('../models/SupplierInvoice');
const credit = require('../services/credit');
const { createSupplierInvoiceFromPO } = require('../services/payables');

let A; // owner of pharmacy A
let B; // owner of pharmacy B
let cashier;

beforeAll(async () => {
  await connectTestDb('finance');
  A = await createPharmacist();
  B = await createPharmacist();
  const email = `cashier_${uid()}@example.com`;
  const created = await request(app).post('/api/staff').set(auth(A.token))
    .send({ name: 'Cash Ier', email, password: 'TempPass123', role: 'cashier' });
  if (created.status !== 201) throw new Error(`setup cashier ${created.status} ${JSON.stringify(created.body)}`);
  const login = await request(app).post('/api/auth/login').send({ email, password: 'TempPass123' });
  cashier = { token: login.body.token };
});

afterAll(disconnectTestDb);

const createCustomer = async (owner, body = {}) => {
  const res = await request(app).post('/api/customers').set(auth(owner.token))
    .send({ name: `Cust ${uid()}`, phone: `09${Math.floor(Math.random() * 1e8)}`, creditLimit: 1000, ...body });
  expect(res.status).toBe(201);
  return res.body.customer;
};

// Inserts a credit sale directly (bypassing the POS) with a given age in days
// and puts it on the customer's account through the credit service.
const creditSale = async (pharmacy, customerId, amount, ageDays = 0) => {
  const createdAt = daysFromNow(-ageDays);
  const { insertedId } = await Sale.collection.insertOne({
    pharmacyId: pharmacy._id,
    pharmacistId: new mongoose.Types.ObjectId(),
    customerId: new mongoose.Types.ObjectId(String(customerId)),
    invoiceNumber: `INV-T-${uid()}`,
    items: [],
    subtotal: amount,
    grandTotal: amount,
    paymentMethod: 'credit',
    paymentStatus: 'pending',
    amountPaid: 0,
    balanceDue: amount,
    voided: false,
    createdAt,
    updatedAt: createdAt,
  });
  await credit.applyCreditSale({ pharmacyId: pharmacy._id, customerId, saleId: insertedId, amount });
  return Sale.findById(insertedId);
};

describe('credit service', () => {
  test('credit limit is enforced (0 = no credit, null = unlimited)', async () => {
    const c = await createCustomer(A, { creditLimit: 100 });
    await expect(credit.assertCreditAllowed({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 60 })).resolves.toBeTruthy();
    await credit.applyCreditSale({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 60 });
    await expect(credit.assertCreditAllowed({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 50 }))
      .rejects.toMatchObject({ status: 400 });
    await expect(credit.applyCreditSale({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 50 }))
      .rejects.toMatchObject({ status: 400 });
    expect((await Customer.findById(c._id)).balance).toBe(60);

    const none = await createCustomer(A, { creditLimit: 0 });
    await expect(credit.assertCreditAllowed({ pharmacyId: A.pharmacy._id, customerId: none._id, amount: 1 }))
      .rejects.toMatchObject({ status: 400 });

    const unlimited = await createCustomer(A, { creditLimit: null });
    expect(unlimited.creditLimit).toBeNull();
    await credit.applyCreditSale({ pharmacyId: A.pharmacy._id, customerId: unlimited._id, amount: 1e6 });
    expect((await Customer.findById(unlimited._id)).balance).toBe(1e6);
  });

  test('inactive or foreign customers are rejected', async () => {
    const c = await createCustomer(A);
    await expect(credit.assertCreditAllowed({ pharmacyId: B.pharmacy._id, customerId: c._id, amount: 1 }))
      .rejects.toMatchObject({ status: 404 });
    await Customer.updateOne({ _id: c._id }, { active: false });
    await expect(credit.applyCreditSale({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 1 }))
      .rejects.toMatchObject({ status: 400 });
  });

  test('concurrent credit sales cannot exceed the limit', async () => {
    const c = await createCustomer(A, { creditLimit: 100 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => credit.applyCreditSale({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 40 }))
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((await Customer.findById(c._id)).balance).toBe(80);
  });

  test('applyCreditSale and reverseCredit change the balance, reversal reduces sale balanceDue', async () => {
    const c = await createCustomer(A);
    const sale = await creditSale(A.pharmacy, c._id, 200);
    expect((await Customer.findById(c._id)).balance).toBe(200);

    const r = await credit.reverseCredit({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 50, refId: sale._id });
    expect(r.reversed).toBe(50);
    expect((await Customer.findById(c._id)).balance).toBe(150);
    expect((await Sale.findById(sale._id)).balanceDue).toBe(150);

    // capped at what is still owed on the sale
    const r2 = await credit.reverseCredit({ pharmacyId: A.pharmacy._id, customerId: c._id, amount: 500, saleId: sale._id });
    expect(r2.reversed).toBe(150);
    expect((await Customer.findById(c._id)).balance).toBe(0);
    expect(await CustomerLedger.countDocuments({ customerId: c._id })).toBe(3);
  });
});

describe('customer API', () => {
  test('CRUD, search and unique phone per pharmacy', async () => {
    const phone = `0977${Math.floor(Math.random() * 1e6)}`;
    const c = await createCustomer(A, { name: 'Abebe Kebede', phone });
    const dup = await request(app).post('/api/customers').set(auth(A.token)).send({ name: 'Other', phone });
    expect(dup.status).toBe(409);
    // same phone in another pharmacy is fine
    const other = await request(app).post('/api/customers').set(auth(B.token)).send({ name: 'Other', phone });
    expect(other.status).toBe(201);
    // two customers without phone are fine
    await createCustomer(A, { phone: '' });
    await createCustomer(A, { phone: '' });

    const search = await request(app).get('/api/customers').query({ search: 'abebe' }).set(auth(A.token));
    expect(search.status).toBe(200);
    expect(search.body.customers.map((x) => x._id)).toContain(c._id);

    const upd = await request(app).put(`/api/customers/${c._id}`).set(auth(A.token)).send({ creditLimit: 250, balance: 9999 });
    expect(upd.status).toBe(200);
    expect(upd.body.customer.creditLimit).toBe(250);
    expect(upd.body.customer.balance).toBe(0);

    const del = await request(app).delete(`/api/customers/${c._id}`).set(auth(A.token));
    expect(del.status).toBe(200);
  });

  test('cashier can view but not manage customers', async () => {
    const list = await request(app).get('/api/customers').set(auth(cashier.token));
    expect(list.status).toBe(200);
    const create = await request(app).post('/api/customers').set(auth(cashier.token)).send({ name: 'X' });
    expect(create.status).toBe(403);
    const c = await createCustomer(A);
    await creditSale(A.pharmacy, c._id, 10);
    const pay = await request(app).post(`/api/customers/${c._id}/payments`).set(auth(cashier.token)).send({ amount: 5 });
    expect(pay.status).toBe(403);
  });

  test('tenant isolation: other pharmacy cannot read or pay a customer', async () => {
    const c = await createCustomer(A);
    await creditSale(A.pharmacy, c._id, 30);
    expect((await request(app).get(`/api/customers/${c._id}`).set(auth(B.token))).status).toBe(404);
    expect((await request(app).get(`/api/customers/${c._id}/statement`).set(auth(B.token))).status).toBe(404);
    expect((await request(app).post(`/api/customers/${c._id}/payments`).set(auth(B.token)).send({ amount: 10 })).status).toBe(404);
    const list = await request(app).get('/api/customers').set(auth(B.token));
    expect(list.body.customers.map((x) => x._id)).not.toContain(c._id);
    const aging = await request(app).get('/api/customers/aging').set(auth(B.token));
    expect(aging.body.customers.map((x) => String(x.customerId))).not.toContain(c._id);
  });

  test('payment allocates oldest-first and updates sales', async () => {
    const c = await createCustomer(A);
    const old = await creditSale(A.pharmacy, c._id, 100, 40);
    const mid = await creditSale(A.pharmacy, c._id, 80, 10);
    const recent = await creditSale(A.pharmacy, c._id, 50, 1);

    const res = await request(app).post(`/api/customers/${c._id}/payments`).set(auth(A.token))
      .send({ amount: 130, method: 'cash', reference: 'R1' });
    expect(res.status).toBe(201);
    expect(res.body.payment.allocations.map((a) => a.amount)).toEqual([100, 30]);
    expect(res.body.customer.balance).toBe(100);

    const [o, m, r] = await Promise.all([Sale.findById(old._id), Sale.findById(mid._id), Sale.findById(recent._id)]);
    expect([o.balanceDue, o.paymentStatus, o.amountPaid]).toEqual([0, 'paid', 100]);
    expect([m.balanceDue, m.paymentStatus, m.amountPaid]).toEqual([50, 'partial', 30]);
    expect([r.balanceDue, r.paymentStatus]).toEqual([50, 'pending']);

    // explicit allocation to the most recent sale first
    const res2 = await request(app).post(`/api/customers/${c._id}/payments`).set(auth(A.token))
      .send({ amount: 60, allocations: [{ saleId: recent._id, amount: 50 }] });
    expect(res2.status).toBe(201);
    expect((await Sale.findById(recent._id)).balanceDue).toBe(0);
    expect((await Sale.findById(mid._id)).balanceDue).toBe(40);

    // overpayment rejected
    const over = await request(app).post(`/api/customers/${c._id}/payments`).set(auth(A.token)).send({ amount: 41 });
    expect(over.status).toBe(400);

    const st = await request(app).get(`/api/customers/${c._id}/statement`).set(auth(A.token));
    expect(st.status).toBe(200);
    expect(st.body.entries).toHaveLength(5);
    expect(st.body.closingBalance).toBe(40);
    expect(st.body.entries[st.body.entries.length - 1].balance).toBe(40);
  });

  test('aging buckets by sale date', async () => {
    const c = await createCustomer(A, { creditLimit: null });
    await creditSale(A.pharmacy, c._id, 10, 5);
    await creditSale(A.pharmacy, c._id, 20, 45);
    await creditSale(A.pharmacy, c._id, 30, 75);
    await creditSale(A.pharmacy, c._id, 40, 120);
    const res = await request(app).get('/api/customers/aging').query({ customerId: c._id }).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(1);
    expect(res.body.customers[0].buckets).toEqual({ '0-30': 10, '31-60': 20, '61-90': 30, '90+': 40 });
    expect(res.body.totals.total).toBe(100);
  });
});

describe('payables', () => {
  let supplier;
  beforeAll(async () => {
    const res = await request(app).post('/api/suppliers').set(auth(A.token))
      .send({ name: `Supplier ${uid()}`, phone: '0911222333', paymentTermsDays: 15 });
    expect(res.status).toBe(201);
    supplier = res.body.supplier;
    expect(supplier.paymentTermsDays).toBe(15);
  });

  test('invoice due date defaults from payment terms; payments allocate oldest-due first', async () => {
    const invoiceDate = new Date('2026-01-01T00:00:00Z');
    const inv1 = await request(app).post('/api/payables/invoices').set(auth(A.token))
      .send({ supplierId: supplier._id, invoiceNo: 'SI-1', invoiceDate, amount: 300 });
    expect(inv1.status).toBe(201);
    expect(new Date(inv1.body.invoice.dueDate).toISOString()).toBe('2026-01-16T00:00:00.000Z');
    const inv2 = await request(app).post('/api/payables/invoices').set(auth(A.token))
      .send({ supplierId: supplier._id, invoiceNo: 'SI-2', invoiceDate: '2026-02-01', amount: 200 });
    expect(inv2.status).toBe(201);
    const dup = await request(app).post('/api/payables/invoices').set(auth(A.token))
      .send({ supplierId: supplier._id, invoiceNo: 'SI-2', amount: 5 });
    expect(dup.status).toBe(409);

    const pay = await request(app).post('/api/payables/payments').set(auth(A.token))
      .send({ supplierId: supplier._id, amount: 350, method: 'bank_transfer' });
    expect(pay.status).toBe(201);
    expect(pay.body.payment.allocations.map((a) => a.amount)).toEqual([300, 50]);
    expect((await SupplierInvoice.findById(inv1.body.invoice._id)).status).toBe('paid');
    const i2 = await SupplierInvoice.findById(inv2.body.invoice._id);
    expect([i2.status, i2.amountPaid]).toEqual(['partial', 50]);

    const over = await request(app).post('/api/payables/payments').set(auth(A.token))
      .send({ supplierId: supplier._id, amount: 151 });
    expect(over.status).toBe(400);

    const bal = await request(app).get(`/api/payables/suppliers/${supplier._id}`).set(auth(A.token));
    expect(bal.body.balance.outstanding).toBe(150);

    const list = await request(app).get('/api/suppliers').set(auth(A.token));
    expect(list.body.suppliers.find((s) => s._id === supplier._id).outstandingBalance).toBe(150);

    const aging = await request(app).get('/api/payables/aging').set(auth(A.token));
    expect(aging.status).toBe(200);
    expect(aging.body.totals.total).toBe(150);
    expect(aging.body.totals['90+']).toBe(150); // due 2026-02-16, today is later than 90 days after

    // paid invoices cannot be deleted
    expect((await request(app).delete(`/api/payables/invoices/${inv1.body.invoice._id}`).set(auth(A.token))).status).toBe(409);
  });

  test('createSupplierInvoiceFromPO helper', async () => {
    const po = { _id: new mongoose.Types.ObjectId(), supplierId: supplier._id, poNumber: 'PO-X-1', totalAmount: 120 };
    const inv = await createSupplierInvoiceFromPO({ pharmacyId: A.pharmacy._id, purchaseOrder: po });
    expect(inv.invoiceNo).toBe('PO-X-1');
    expect(inv.amount).toBe(120);
    const second = await createSupplierInvoiceFromPO({ pharmacyId: A.pharmacy._id, purchaseOrder: po, amount: 20 });
    expect(second.invoiceNo).toBe('PO-X-1-2');
  });

  test('cashier cannot pay suppliers; other tenant cannot see invoices', async () => {
    const res = await request(app).post('/api/payables/payments').set(auth(cashier.token))
      .send({ supplierId: supplier._id, amount: 1 });
    expect(res.status).toBe(403);
    const list = await request(app).get('/api/payables/invoices').set(auth(B.token));
    expect(list.status).toBe(200);
    expect(list.body.invoices).toHaveLength(0);
    const acct = await request(app).get(`/api/payables/suppliers/${supplier._id}`).set(auth(B.token));
    expect(acct.status).toBe(404);
    const pay = await request(app).post('/api/payables/payments').set(auth(B.token)).send({ supplierId: supplier._id, amount: 1 });
    expect(pay.status).toBe(404);
  });
});
