const {
  app, request, auth, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const StockBatch = require('../models/StockBatch');
const Sale = require('../models/Sale');

let A;

beforeAll(async () => {
  await connectTestDb('sales');
  A = await createPharmacist();
});

afterAll(disconnectTestDb);

const qtyOf = async (batch) => (await StockBatch.findById(batch._id)).quantity;

const sell = (token, body) => request(app)
  .post('/api/sales')
  .set(auth(token))
  .send({ paymentMethod: 'cash', ...body });

describe('POST /api/sales - FEFO (#1)', () => {
  test('deducts from the earliest-expiring batch first and never from an expired batch', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const expired = await insertBatchRaw(A.pharmacy._id, med._id, { batchNo: 'EXPIRED', quantity: 100, expiryDate: daysFromNow(-5) });
    const late = await insertBatchRaw(A.pharmacy._id, med._id, { batchNo: 'LATE', quantity: 50, expiryDate: daysFromNow(300) });
    const early = await insertBatchRaw(A.pharmacy._id, med._id, { batchNo: 'EARLY', quantity: 5, expiryDate: daysFromNow(30) });

    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 8 }] });

    expect(res.status).toBe(201);
    expect(await qtyOf(expired)).toBe(100);
    expect(await qtyOf(early)).toBe(0);
    expect(await qtyOf(late)).toBe(47);
    const batchNos = res.body.sale.items.map((i) => i.batchNo);
    expect(batchNos).not.toContain('EXPIRED');
    expect(batchNos).toEqual(['EARLY', 'LATE']);
  });

  test('rejects a sale when the only stock left is expired', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const expired = await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 100, expiryDate: daysFromNow(-1) });

    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(await qtyOf(expired)).toBe(100);
  });
});

describe('POST /api/sales - atomicity (#2)', () => {
  test('a 2-item sale where item 2 is out of stock returns 400 and leaves item 1 stock unchanged', async () => {
    const med1 = await createMedicine(A.pharmacy._id);
    const med2 = await createMedicine(A.pharmacy._id);
    const b1 = await insertBatchRaw(A.pharmacy._id, med1._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const b2 = await insertBatchRaw(A.pharmacy._id, med2._id, { quantity: 1, expiryDate: daysFromNow(100) });
    const salesBefore = await Sale.countDocuments({ pharmacyId: A.pharmacy._id });

    const res = await sell(A.token, {
      items: [
        { medicineId: med1._id, quantity: 3 },
        { medicineId: med2._id, quantity: 5 },
      ],
    });

    expect(res.status).toBe(400);
    expect(await qtyOf(b1)).toBe(10);
    expect(await qtyOf(b2)).toBe(1);
    expect(await Sale.countDocuments({ pharmacyId: A.pharmacy._id })).toBe(salesBefore);
  });

  test('concurrent sales cannot oversell the same batch', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const b = await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 5, expiryDate: daysFromNow(100) });

    const results = await Promise.all([1, 2, 3].map(() => sell(A.token, { items: [{ medicineId: med._id, quantity: 4 }] })));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await qtyOf(b)).toBe(1);
  });
});

describe('POST /api/sales - input validation (#4)', () => {
  let med;
  let batch;

  beforeAll(async () => {
    med = await createMedicine(A.pharmacy._id, { price: 10 });
    batch = await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 50, expiryDate: daysFromNow(100) });
  });

  test('negative discount returns 400 and does not touch stock', async () => {
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 2 }], discount: -5 });
    expect(res.status).toBe(400);
    expect(await qtyOf(batch)).toBe(50);
  });

  test('discount greater than subtotal returns 400 and does not touch stock', async () => {
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 2 }], discount: 25 });
    expect(res.status).toBe(400);
    expect(await qtyOf(batch)).toBe(50);
  });

  test('negative tax returns 400 and does not touch stock', async () => {
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 2 }], tax: -1 });
    expect(res.status).toBe(400);
    expect(await qtyOf(batch)).toBe(50);
  });

  test('invalid payment method returns 400 and does not touch stock', async () => {
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 2 }], paymentMethod: 'bitcoin' });
    expect(res.status).toBe(400);
    expect(await qtyOf(batch)).toBe(50);
  });

  test('a valid discount is accepted', async () => {
    const res = await sell(A.token, { items: [{ medicineId: med._id, quantity: 2 }], discount: 5 });
    expect(res.status).toBe(201);
    expect(res.body.sale.grandTotal).toBe(15);
    expect(await qtyOf(batch)).toBe(48);
  });
});

describe('POST /api/sales - prescription medicines (#14)', () => {
  let rxMed;
  let rxBatch;

  beforeAll(async () => {
    rxMed = await createMedicine(A.pharmacy._id, { requiresPrescription: true });
    rxBatch = await insertBatchRaw(A.pharmacy._id, rxMed._id, { quantity: 20, expiryDate: daysFromNow(100) });
  });

  test('sale without a prescription returns 400 and does not touch stock', async () => {
    const res = await sell(A.token, { items: [{ medicineId: rxMed._id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(await qtyOf(rxBatch)).toBe(20);
  });

  test('sale with a prescription returns 201 and stores it on the sale', async () => {
    const res = await sell(A.token, {
      items: [{ medicineId: rxMed._id, quantity: 1 }],
      prescription: { number: 'RX-12345', prescriber: 'Dr. Test' },
    });
    expect(res.status).toBe(201);
    expect(await qtyOf(rxBatch)).toBe(19);
    const sale = await Sale.findById(res.body.sale._id).lean();
    expect(sale.prescription).toEqual(expect.objectContaining({ number: 'RX-12345', prescriber: 'Dr. Test' }));
  });
});

describe('Invoice numbers (#15)', () => {
  test('two concurrent sales get distinct invoice numbers', async () => {
    const med = await createMedicine(A.pharmacy._id);
    await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const [r1, r2] = await Promise.all([1, 2].map(() => sell(A.token, { items: [{ medicineId: med._id, quantity: 1 }] })));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.sale.invoiceNumber).not.toBe(r2.body.sale.invoiceNumber);
  });
});
