const {
  app, request, auth, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine,
} = require('./helpers');
const StockBatch = require('../models/StockBatch');

let A;
let med;

beforeAll(async () => {
  await connectTestDb('stock');
  A = await createPharmacist();
  med = await createMedicine(A.pharmacy._id);
});

afterAll(disconnectTestDb);

const expiry = daysFromNow(200).toISOString();

const stockIn = (body) => request(app).post('/api/stock').set(auth(A.token)).send({
  medicineId: med._id, batchNo: 'B-1', quantity: 10, expiryDate: expiry, purchasePrice: 4, ...body,
});

describe('POST /api/stock - validation (#5)', () => {
  test('valid stock-in returns 201', async () => {
    const res = await stockIn({});
    expect(res.status).toBe(201);
    expect(res.body.batch.quantity).toBe(10);
  });

  test('quantity -5 returns 400 and does not reduce the existing batch', async () => {
    const res = await stockIn({ quantity: -5 });
    expect(res.status).toBe(400);
    const batch = await StockBatch.findOne({ pharmacyId: A.pharmacy._id, medicineId: med._id, batchNo: 'B-1' });
    expect(batch.quantity).toBe(10);
  });

  test('quantity 0 returns 400', async () => {
    const res = await stockIn({ batchNo: 'B-ZERO', quantity: 0 });
    expect(res.status).toBe(400);
  });

  test('fractional quantity returns 400', async () => {
    const res = await stockIn({ batchNo: 'B-FRAC', quantity: 2.5 });
    expect(res.status).toBe(400);
  });

  test('past expiry date returns 400', async () => {
    const res = await stockIn({ batchNo: 'B-PAST', expiryDate: daysFromNow(-3).toISOString() });
    expect(res.status).toBe(400);
  });

  test('invalid expiry date returns 400', async () => {
    const res = await stockIn({ batchNo: 'B-BAD', expiryDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});
