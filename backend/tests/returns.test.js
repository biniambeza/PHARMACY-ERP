const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');

const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const Sale = require('../models/Sale');
const Return = require('../models/Return');
const AuditLog = require('../models/AuditLog');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');

let A; // owner of pharmacy A
let B; // owner of pharmacy B
let cashierToken;

beforeAll(async () => {
  await connectTestDb('returns');
  A = await createPharmacist();
  B = await createPharmacist();

  const email = `cashier_${uid()}@example.com`;
  const created = await request(app).post('/api/staff').set(auth(A.token))
    .send({ name: 'Cashier', email, password: PASSWORD, role: 'cashier' });
  expect(created.status).toBe(201);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  cashierToken = login.body.token;
});

afterAll(disconnectTestDb);

const qtyOf = async (batch) => (await StockBatch.findById(batch._id)).quantity;

// Creates a medicine with a single batch and sells `sellQty` of it.
const makeSale = async (owner, { stock = 10, sellQty = 5, price = 10 } = {}) => {
  const med = await createMedicine(owner.pharmacy._id, { price });
  const batch = await insertBatchRaw(owner.pharmacy._id, med._id, { quantity: stock, expiryDate: daysFromNow(200) });
  const res = await request(app).post('/api/sales').set(auth(owner.token))
    .send({ paymentMethod: 'cash', items: [{ medicineId: med._id, quantity: sellQty }] });
  expect(res.status).toBe(201);
  return { med, batch, sale: res.body.sale };
};

const doReturn = (token, sale, items, extra = {}) => request(app)
  .post('/api/returns')
  .set(auth(token))
  .send({ saleId: sale._id, reason: 'Customer changed mind', refundMethod: 'cash', items, ...extra });

describe('POST /api/returns', () => {
  test('partial return restocks the same batch, creates a movement and marks the sale partial', async () => {
    const { batch, sale } = await makeSale(A, { stock: 10, sellQty: 5 });
    expect(await qtyOf(batch)).toBe(5);

    const res = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 2 }]);
    expect(res.status).toBe(201);
    expect(res.body.return.returnNumber).toMatch(/^RET-\d{4}-\d{6}$/);
    expect(res.body.return.refundTotal).toBe(20);
    expect(res.body.sale.returnStatus).toBe('partial');
    expect(await qtyOf(batch)).toBe(7);

    const mv = await StockMovement.findOne({ batchId: batch._id, type: 'return' });
    expect(mv).toBeTruthy();
    expect(mv.quantityChange).toBe(2);
    expect(mv.balanceAfter).toBe(7);
    expect(String(mv.refId)).toBe(String(res.body.return._id));
    expect(await AuditLog.exists({ action: 'sale.return', entityId: res.body.return._id })).toBeTruthy();

    // Returning the rest makes it full
    const rest = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 3 }]);
    expect(rest.status).toBe(201);
    expect(rest.body.sale.returnStatus).toBe('full');
    expect(await qtyOf(batch)).toBe(10);
  });

  test('reactivates a depleted batch on restock', async () => {
    const { batch, sale } = await makeSale(A, { stock: 4, sellQty: 4 });
    expect((await StockBatch.findById(batch._id)).status).toBe('depleted');
    const res = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(res.status).toBe(201);
    const after = await StockBatch.findById(batch._id);
    expect(after.quantity).toBe(1);
    expect(after.status).toBe('active');
  });

  test('over-return is rejected, including across multiple returns', async () => {
    const { batch, sale } = await makeSale(A, { stock: 10, sellQty: 3 });
    const tooMany = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 4 }]);
    expect(tooMany.status).toBe(400);

    const ok = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 2 }]);
    expect(ok.status).toBe(201);
    const again = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 2 }]);
    expect(again.status).toBe(400);
    expect(await qtyOf(batch)).toBe(9);
    expect(await Return.countDocuments({ saleId: sale._id })).toBe(1);
  });

  test('discard does not restock and records no movement', async () => {
    const { batch, sale } = await makeSale(A, { stock: 10, sellQty: 5 });
    const res = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 2, disposition: 'discard' }]);
    expect(res.status).toBe(201);
    expect(res.body.return.items[0].restocked).toBe(false);
    expect(res.body.return.refundTotal).toBe(20);
    expect(await qtyOf(batch)).toBe(5);
    expect(await StockMovement.countDocuments({ batchId: batch._id, type: 'return' })).toBe(0);
  });

  test('a batch that has since expired is not restocked', async () => {
    const { batch, sale } = await makeSale(A, { stock: 10, sellQty: 5 });
    await StockBatch.collection.updateOne({ _id: batch._id }, { $set: { expiryDate: daysFromNow(-1) } });
    const res = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(res.status).toBe(201);
    expect(res.body.return.items[0].restocked).toBe(false);
    expect(await qtyOf(batch)).toBe(5);
  });

  test('rejects items that do not belong to the sale and missing reasons', async () => {
    const { sale } = await makeSale(A);
    const bad = await doReturn(A.token, sale, [{ saleItemId: new mongoose.Types.ObjectId(), quantity: 1 }]);
    expect(bad.status).toBe(400);
    const noReason = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }], { reason: '' });
    expect(noReason.status).toBe(400);
  });

  // Turns a cash sale into a credit sale owed by a real customer (uses the real services/credit.js).
  const makeCreditSale = async (owner, { stock = 10, sellQty = 5, paidInCash = 0 } = {}) => {
    const { batch, sale } = await makeSale(owner, { stock, sellQty });
    const owed = sale.grandTotal - paidInCash;
    const customer = await Customer.create({ pharmacyId: owner.pharmacy._id, name: `Cust ${uid()}`, creditLimit: null, balance: owed });
    const payments = paidInCash > 0
      ? [{ method: 'cash', amount: paidInCash }, { method: 'credit', amount: owed }]
      : [{ method: 'credit', amount: owed }];
    await Sale.updateOne(
      { _id: sale._id },
      { $set: { customerId: customer._id, paymentMethod: 'credit', paymentStatus: 'pending', payments, amountPaid: paidInCash, balanceDue: owed } }
    );
    return { batch, sale, customer };
  };

  test('credit sale return reduces the real customer balance and the sale balanceDue', async () => {
    const { sale, customer } = await makeCreditSale(A, { sellQty: 5 }); // 50 owed
    const res = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 2 }]);
    expect(res.status).toBe(201);
    expect(res.body.warning).toBeUndefined();
    expect(res.body.return.refundTotal).toBe(20);
    expect(res.body.return.creditReversed).toBe(20);
    expect(res.body.return.refundDue).toBe(0);
    expect(res.body.return.refundMethod).toBe('cash'); // kept as chosen
    expect((await Customer.findById(customer._id)).balance).toBe(30);
    const saleDoc = await Sale.findById(sale._id);
    expect(saleDoc.balanceDue).toBe(30);
    expect(saleDoc.returnStatus).toBe('partial');
    const ledger = await CustomerLedger.findOne({ customerId: customer._id, type: 'reversal' });
    expect(ledger.amount).toBe(-20);
    expect(String(ledger.refId)).toBe(String(res.body.return._id));
  });

  test('reversal is capped at what is still owed; the remainder is refunded via refundMethod', async () => {
    // 50 sale: 30 paid in cash, 20 on credit; customer has since paid 15 off (owes 5)
    const { sale, customer } = await makeCreditSale(A, { sellQty: 5, paidInCash: 30 });
    await Customer.updateOne({ _id: customer._id }, { $set: { balance: 5 } });
    await Sale.updateOne({ _id: sale._id }, { $set: { balanceDue: 5 } });

    const res = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 5 }], { refundMethod: 'mobile_money' });
    expect(res.status).toBe(201);
    expect(res.body.return.refundTotal).toBe(50);
    expect(res.body.return.creditReversed).toBe(5);
    expect(res.body.return.refundDue).toBe(45);
    expect(res.body.return.refundMethod).toBe('mobile_money');
    expect((await Customer.findById(customer._id)).balance).toBe(0);
    const saleDoc = await Sale.findById(sale._id);
    expect(saleDoc.balanceDue).toBe(0);
    expect(saleDoc.paymentStatus).toBe('paid');
    expect(saleDoc.returnStatus).toBe('full');
  });

  test('voiding a credit sale reverses the full credit through the real service', async () => {
    const { batch, sale, customer } = await makeCreditSale(A, { sellQty: 4 }); // 40 owed
    const res = await request(app).post(`/api/returns/void/${sale._id}`).set(auth(A.token)).send({ reason: 'Wrong customer' });
    expect(res.status).toBe(200);
    expect(res.body.creditReversed).toBe(40);
    expect(res.body.refundDue).toBe(0);
    expect((await Customer.findById(customer._id)).balance).toBe(0);
    expect((await Sale.findById(sale._id)).balanceDue).toBe(0);
    expect(await qtyOf(batch)).toBe(10);
  });

  test('cashier without sales:return gets 403', async () => {
    const { sale } = await makeSale(A);
    const res = await doReturn(cashierToken, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(res.status).toBe(403);
    expect(res.body.missing).toContain('sales:return');

    const voidRes = await request(app).post(`/api/returns/void/${sale._id}`).set(auth(cashierToken))
      .send({ reason: 'mistake' });
    expect(voidRes.status).toBe(403);
  });
});

describe('POST /api/returns/void/:saleId', () => {
  test('void restocks all items, marks the sale voided and blocks later returns', async () => {
    const { batch, sale } = await makeSale(A, { stock: 10, sellQty: 6 });
    expect(await qtyOf(batch)).toBe(4);

    const res = await request(app).post(`/api/returns/void/${sale._id}`).set(auth(A.token))
      .set('x-timezone', 'Africa/Addis_Ababa').send({ reason: 'Wrong item scanned' });
    expect(res.status).toBe(200);
    expect(res.body.sale.voided).toBe(true);
    expect(res.body.sale.voidReason).toBe('Wrong item scanned');
    expect(await qtyOf(batch)).toBe(10);
    expect(await StockMovement.countDocuments({ refId: sale._id, type: 'void' })).toBe(1);
    expect(await AuditLog.exists({ action: 'sale.void', entityId: sale._id })).toBeTruthy();

    const ret = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(ret.status).toBe(400);
    const again = await request(app).post(`/api/returns/void/${sale._id}`).set(auth(A.token)).send({ reason: 'x' });
    expect(again.status).toBe(400);
    expect(await qtyOf(batch)).toBe(10);
  });

  test('cannot void a returned sale or a sale from another day', async () => {
    const { sale } = await makeSale(A);
    await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    const returned = await request(app).post(`/api/returns/void/${sale._id}`).set(auth(A.token)).send({ reason: 'x' });
    expect(returned.status).toBe(400);

    const { sale: old } = await makeSale(A);
    await Sale.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(old._id) },
      { $set: { createdAt: daysFromNow(-2) } }
    );
    const oldRes = await request(app).post(`/api/returns/void/${old._id}`).set(auth(A.token)).send({ reason: 'x' });
    expect(oldRes.status).toBe(400);
  });
});

describe('Tenant isolation and listing', () => {
  test('another pharmacy cannot return, void or read returns of this pharmacy', async () => {
    const { batch, sale } = await makeSale(A, { stock: 10, sellQty: 5 });
    const ret = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(ret.status).toBe(201);

    const crossReturn = await doReturn(B.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    expect(crossReturn.status).toBe(404);
    const crossVoid = await request(app).post(`/api/returns/void/${sale._id}`).set(auth(B.token)).send({ reason: 'x' });
    expect(crossVoid.status).toBe(404);
    const crossGet = await request(app).get(`/api/returns/${ret.body.return._id}`).set(auth(B.token));
    expect(crossGet.status).toBe(404);
    const listB = await request(app).get('/api/returns').set(auth(B.token));
    expect(listB.status).toBe(200);
    expect(listB.body.returns).toHaveLength(0);
    expect(await qtyOf(batch)).toBe(6);
  });

  test('list supports search by return number and invoice number', async () => {
    const { sale } = await makeSale(A);
    const ret = await doReturn(A.token, sale, [{ saleItemId: sale.items[0]._id, quantity: 1 }]);
    const byRet = await request(app).get('/api/returns').set(auth(A.token))
      .query({ search: ret.body.return.returnNumber });
    expect(byRet.status).toBe(200);
    expect(byRet.body.returns).toHaveLength(1);
    const byInv = await request(app).get('/api/returns').set(auth(A.token)).query({ search: sale.invoiceNumber });
    expect(byInv.body.returns.map((r) => r._id)).toContain(ret.body.return._id);
    const one = await request(app).get(`/api/returns/${ret.body.return._id}`).set(auth(A.token));
    expect(one.status).toBe(200);
    expect(one.body.return.saleId.invoiceNumber).toBe(sale.invoiceNumber);
  });
});
