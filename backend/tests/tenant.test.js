const {
  app, request, auth, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/PurchaseOrder');

// Collects every `_id` found anywhere in a JSON response body, so list assertions
// keep working if response shapes change (pagination wrappers etc).
const collectIds = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((v) => collectIds(v, out));
  else if (value && typeof value === 'object') {
    if (value._id) out.add(String(value._id));
    Object.values(value).forEach((v) => collectIds(v, out));
  }
  return out;
};

let A;
let B;
const bData = {};

beforeAll(async () => {
  await connectTestDb('tenant');
  A = await createPharmacist();
  B = await createPharmacist();

  bData.medicine = await createMedicine(B.pharmacy._id, { name: 'B-Only Medicine' });
  bData.batch = await insertBatchRaw(B.pharmacy._id, bData.medicine._id, { quantity: 30, expiryDate: daysFromNow(200) });

  const saleRes = await request(app).post('/api/sales').set(auth(B.token))
    .send({ items: [{ medicineId: bData.medicine._id, quantity: 1 }], paymentMethod: 'cash' });
  if (saleRes.status !== 201) throw new Error(`setup: B sale failed ${saleRes.status} ${JSON.stringify(saleRes.body)}`);
  bData.sale = saleRes.body.sale;

  const supRes = await request(app).post('/api/suppliers').set(auth(B.token))
    .send({ name: 'B Supplier', phone: '0911222333' });
  if (supRes.status !== 201) throw new Error(`setup: B supplier failed ${supRes.status} ${JSON.stringify(supRes.body)}`);
  bData.supplier = supRes.body.supplier;

  const poRes = await request(app).post('/api/procurement/orders').set(auth(B.token))
    .send({ supplierId: bData.supplier._id, items: [{ medicineId: bData.medicine._id, quantityOrdered: 10, unitCost: 3 }] });
  if (poRes.status !== 201) throw new Error(`setup: B PO failed ${poRes.status} ${JSON.stringify(poRes.body)}`);
  bData.order = poRes.body.order;
});

afterAll(disconnectTestDb);

describe('Tenant isolation: pharmacist A cannot reach pharmacy B data by id', () => {
  test('GET /api/medicines/:id -> 404', async () => {
    const res = await request(app).get(`/api/medicines/${bData.medicine._id}`).set(auth(A.token));
    expect(res.status).toBe(404);
  });

  test('PUT /api/medicines/:id -> 404 and B medicine unchanged', async () => {
    const res = await request(app).put(`/api/medicines/${bData.medicine._id}`).set(auth(A.token)).send({ price: 999 });
    expect(res.status).toBe(404);
    const after = await request(app).get(`/api/medicines/${bData.medicine._id}`).set(auth(B.token));
    expect(after.body.medicine.price).toBe(bData.medicine.price);
  });

  test('GET /api/sales/:id -> 404', async () => {
    const res = await request(app).get(`/api/sales/${bData.sale._id}`).set(auth(A.token));
    expect(res.status).toBe(404);
  });

  test('PATCH /api/stock/:id/adjust on B batch -> 404 and quantity unchanged', async () => {
    const before = (await StockBatch.findById(bData.batch._id)).quantity;
    const res = await request(app).patch(`/api/stock/${bData.batch._id}/adjust`).set(auth(A.token))
      .send({ adjustmentType: 'damaged', reduceQty: 1 });
    expect(res.status).toBe(404);
    expect((await StockBatch.findById(bData.batch._id)).quantity).toBe(before);
  });

  test('DELETE /api/stock/:id on B batch -> 404 and batch still exists', async () => {
    const res = await request(app).delete(`/api/stock/${bData.batch._id}`).set(auth(A.token));
    expect(res.status).toBe(404);
    expect(await StockBatch.findById(bData.batch._id)).not.toBeNull();
  });

  test('POST /api/stock for B medicine -> 404', async () => {
    const res = await request(app).post('/api/stock').set(auth(A.token)).send({
      medicineId: bData.medicine._id, batchNo: 'A-INTO-B', quantity: 5, expiryDate: daysFromNow(100).toISOString(),
    });
    expect(res.status).toBe(404);
  });

  test('POST /api/sales with B medicine -> 404 and B stock unchanged', async () => {
    const before = (await StockBatch.findById(bData.batch._id)).quantity;
    const res = await request(app).post('/api/sales').set(auth(A.token))
      .send({ items: [{ medicineId: bData.medicine._id, quantity: 1 }], paymentMethod: 'cash' });
    expect(res.status).toBe(404);
    expect((await StockBatch.findById(bData.batch._id)).quantity).toBe(before);
  });

  test('GET /api/suppliers/:id -> 404', async () => {
    const res = await request(app).get(`/api/suppliers/${bData.supplier._id}`).set(auth(A.token));
    expect(res.status).toBe(404);
  });

  test('GET /api/procurement/orders/:id -> 404', async () => {
    const res = await request(app).get(`/api/procurement/orders/${bData.order._id}`).set(auth(A.token));
    expect(res.status).toBe(404);
  });

  test('PATCH /api/procurement/orders/:id/receive on B order is rejected and order stays "ordered"', async () => {
    const res = await request(app).patch(`/api/procurement/orders/${bData.order._id}/receive`).set(auth(A.token))
      .send({ batchDetails: [{ medicineId: bData.medicine._id, batchNo: 'X', expiryDate: daysFromNow(100).toISOString() }] });
    expect([400, 404]).toContain(res.status);
    expect((await PurchaseOrder.findById(bData.order._id)).status).toBe('ordered');
  });
});

describe('Tenant isolation: B items do not appear in A lists', () => {
  test.each([
    ['/api/medicines', () => bData.medicine._id],
    ['/api/stock', () => bData.batch._id],
    ['/api/sales', () => bData.sale._id],
    ['/api/suppliers', () => bData.supplier._id],
    ['/api/procurement/orders', () => bData.order._id],
  ])('GET %s', async (path, getId) => {
    const resA = await request(app).get(path).set(auth(A.token));
    expect(resA.status).toBe(200);
    expect(collectIds(resA.body).has(String(getId()))).toBe(false);

    // Sanity check: B does see its own item, so the assertion above is meaningful.
    const resB = await request(app).get(path).set(auth(B.token));
    expect(resB.status).toBe(200);
    expect(collectIds(resB.body).has(String(getId()))).toBe(true);
  });
});
