const {
  app, request, auth, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine,
} = require('./helpers');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/PurchaseOrder');

let A;
let supplier;

beforeAll(async () => {
  await connectTestDb('procurement');
  A = await createPharmacist();
  const res = await request(app).post('/api/suppliers').set(auth(A.token)).send({ name: 'Acme Pharma', phone: '0911000111' });
  if (res.status !== 201) throw new Error(`setup: supplier failed ${res.status} ${JSON.stringify(res.body)}`);
  supplier = res.body.supplier;
});

afterAll(disconnectTestDb);

async function createOrder(items) {
  const res = await request(app).post('/api/procurement/orders').set(auth(A.token))
    .send({ supplierId: supplier._id, items });
  expect(res.status).toBe(201);
  return res.body.order;
}

const receive = (orderId, batchDetails) => request(app)
  .patch(`/api/procurement/orders/${orderId}/receive`)
  .set(auth(A.token))
  .send({ batchDetails });

const totalStock = async (medicineId) => {
  const batches = await StockBatch.find({ pharmacyId: A.pharmacy._id, medicineId });
  return batches.reduce((s, b) => s + b.quantity, 0);
};

describe('PATCH /api/procurement/orders/:id/receive (#3)', () => {
  test('receiving the same order twice returns 400 and stock is only added once', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 20, unitCost: 3 }]);
    const details = [{ medicineId: med._id, batchNo: 'PO-B1', expiryDate: daysFromNow(365).toISOString() }];

    const first = await receive(order._id, details);
    expect(first.status).toBe(200);

    const second = await receive(order._id, details);
    expect(second.status).toBe(400);

    expect(await totalStock(med._id)).toBe(20);
  });

  test('concurrent receives of the same order add stock only once', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 15, unitCost: 2 }]);
    const details = [{ medicineId: med._id, batchNo: 'PO-C1', expiryDate: daysFromNow(365).toISOString() }];

    const results = await Promise.all([receive(order._id, details), receive(order._id, details), receive(order._id, details)]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await totalStock(med._id)).toBe(15);
  });

  test('missing batch details for one item adds no stock and leaves the order "ordered"', async () => {
    const med1 = await createMedicine(A.pharmacy._id);
    const med2 = await createMedicine(A.pharmacy._id);
    const order = await createOrder([
      { medicineId: med1._id, quantityOrdered: 5, unitCost: 1 },
      { medicineId: med2._id, quantityOrdered: 5, unitCost: 1 },
    ]);

    const res = await receive(order._id, [
      { medicineId: med1._id, batchNo: 'PO-P1', expiryDate: daysFromNow(365).toISOString() },
      { medicineId: med2._id, expiryDate: daysFromNow(365).toISOString() }, // no batchNo
    ]);

    expect(res.status).toBe(400);
    expect(await totalStock(med1._id)).toBe(0);
    expect(await totalStock(med2._id)).toBe(0);
    expect((await PurchaseOrder.findById(order._id)).status).toBe('ordered');
  });

  test('batchDetails entry without medicineId returns 400 (no crash)', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 5, unitCost: 1 }]);

    const res = await receive(order._id, [{ batchNo: 'NO-MED', expiryDate: daysFromNow(365).toISOString() }]);

    expect(res.status).toBe(400);
    expect(await totalStock(med._id)).toBe(0);
  });
});
