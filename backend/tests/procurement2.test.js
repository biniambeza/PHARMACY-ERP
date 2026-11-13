const {
  app, request, auth, daysFromNow, uid,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const PurchaseOrder = require('../models/PurchaseOrder');
const Sale = require('../models/Sale');

let A;
let supplier;
let supplier2;

const exp = (days = 365) => daysFromNow(days).toISOString();

async function createSupplier(name) {
  const res = await request(app).post('/api/suppliers').set(auth(A.token)).send({ name, phone: '0911000111' });
  if (res.status !== 201) throw new Error(`setup: supplier failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.supplier;
}

beforeAll(async () => {
  await connectTestDb('procurement2');
  A = await createPharmacist();
  supplier = await createSupplier('Alpha Pharma');
  supplier2 = await createSupplier('Beta Pharma');
});

afterAll(disconnectTestDb);

async function createOrder(items, extra = {}) {
  const res = await request(app).post('/api/procurement/orders').set(auth(A.token))
    .send({ supplierId: supplier._id, items, ...extra });
  expect(res.status).toBe(201);
  return res.body.order;
}

const receive = (orderId, body) => request(app)
  .patch(`/api/procurement/orders/${orderId}/receive`)
  .set(auth(A.token))
  .send(body);

const totalStock = async (medicineId) => {
  const batches = await StockBatch.find({ pharmacyId: A.pharmacy._id, medicineId });
  return batches.reduce((s, b) => s + b.quantity, 0);
};

describe('partial receiving (#9)', () => {
  test('partial receive (two batches) then complete', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 100, unitCost: 2 }]);

    const r1 = await receive(order._id, {
      lines: [
        { medicineId: med._id, batchNo: 'P-1', expiryDate: exp(300), quantity: 30 },
        { medicineId: med._id, batchNo: 'P-2', expiryDate: exp(400), quantity: 20 },
      ],
    });
    expect(r1.status).toBe(200);
    expect(r1.body.order.status).toBe('partially_received');
    expect(r1.body.order.items[0].quantityReceived).toBe(50);
    expect(r1.body.order.receipts).toHaveLength(1);
    expect(r1.body.receipt.receiptNo).toMatch(/^GRN-\d{4}-\d{6}$/);
    expect(r1.body.receipt.totalCost).toBe(100);
    expect(await totalStock(med._id)).toBe(50);

    const r2 = await receive(order._id, {
      lines: [{ medicineId: med._id, batchNo: 'P-3', expiryDate: exp(500), quantity: 50 }],
      supplierInvoiceNo: 'INV-77',
      supplierInvoiceDate: new Date().toISOString(),
    });
    expect(r2.status).toBe(200);
    expect(r2.body.order.status).toBe('received');
    expect(r2.body.order.receivedDate).toBeTruthy();
    expect(r2.body.order.receipts).toHaveLength(2);
    expect(r2.body.order.receipts[1].supplierInvoiceNo).toBe('INV-77');
    expect(r2.body.order.receipts[0].receiptNo).not.toBe(r2.body.order.receipts[1].receiptNo);
    expect(await totalStock(med._id)).toBe(100);

    // With the Finance payables service present, the supplier invoice covers this delivery only.
    let payables = null;
    try { payables = require('../services/payables'); } catch { payables = null; }
    if (payables && typeof payables.createSupplierInvoiceFromPO === 'function') {
      expect(r2.body.supplierInvoiceCreated).toBe(true);
      const SupplierInvoice = require('../models/SupplierInvoice');
      const inv = await SupplierInvoice.findOne({ purchaseOrderId: order._id });
      expect(inv.invoiceNo).toBe('INV-77');
      expect(inv.amount).toBe(100);
    }

    const moves = await StockMovement.find({ refId: order._id, type: 'purchase_receive' });
    expect(moves).toHaveLength(3);

    // Fully received: further receives are rejected
    const r3 = await receive(order._id, {
      lines: [{ medicineId: med._id, batchNo: 'P-4', expiryDate: exp(), quantity: 1 }],
    });
    expect(r3.status).toBe(400);
  });

  test('over-receiving beyond the ordered quantity is rejected and adds nothing', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 10, unitCost: 1 }]);

    const over = await receive(order._id, {
      lines: [
        { medicineId: med._id, batchNo: 'O-1', expiryDate: exp(), quantity: 6 },
        { medicineId: med._id, batchNo: 'O-2', expiryDate: exp(), quantity: 5 },
      ],
    });
    expect(over.status).toBe(400);
    expect(await totalStock(med._id)).toBe(0);

    const part = await receive(order._id, { lines: [{ medicineId: med._id, batchNo: 'O-1', expiryDate: exp(), quantity: 8 }] });
    expect(part.status).toBe(200);
    const over2 = await receive(order._id, { lines: [{ medicineId: med._id, batchNo: 'O-3', expiryDate: exp(), quantity: 3 }] });
    expect(over2.status).toBe(400);
    expect(await totalStock(med._id)).toBe(8);
  });

  test('bonus quantity adds stock on top of the order and is recorded', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 10, unitCost: 4 }]);

    const res = await receive(order._id, {
      lines: [{ medicineId: med._id, batchNo: 'BON-1', expiryDate: exp(), quantity: 10, bonusQuantity: 2 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('received');
    expect(res.body.order.items[0].quantityReceived).toBe(10);
    expect(res.body.order.items[0].bonusQuantity).toBe(2);
    expect(res.body.receipt.totalCost).toBe(40); // bonus is free
    expect(await totalStock(med._id)).toBe(12);

    const move = await StockMovement.findOne({ refId: order._id, type: 'purchase_receive' });
    expect(move.quantityChange).toBe(12);
    expect(move.reason).toMatch(/2 bonus/);
  });

  test('concurrent partial receives never exceed the ordered quantity', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 20, unitCost: 1 }]);

    const body = (n) => ({ lines: [{ medicineId: med._id, batchNo: `CC-${n}`, expiryDate: exp(), quantity: 15 }] });
    const results = await Promise.all([receive(order._id, body(1)), receive(order._id, body(2)), receive(order._id, body(3))]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await totalStock(med._id)).toBe(15);
    const fresh = await PurchaseOrder.findById(order._id);
    expect(fresh.items[0].quantityReceived).toBe(15);
    expect(fresh.receipts).toHaveLength(1);
  });

  test('legacy batchDetails payload receives the full outstanding quantity', async () => {
    const med1 = await createMedicine(A.pharmacy._id);
    const med2 = await createMedicine(A.pharmacy._id);
    const order = await createOrder([
      { medicineId: med1._id, quantityOrdered: 10, unitCost: 1 },
      { medicineId: med2._id, quantityOrdered: 6, unitCost: 1 },
    ]);

    // Partially receive med1 first, then the legacy payload should receive only what is left.
    const part = await receive(order._id, { lines: [{ medicineId: med1._id, batchNo: 'L-0', expiryDate: exp(), quantity: 4 }] });
    expect(part.status).toBe(200);

    const res = await receive(order._id, {
      batchDetails: [
        { medicineId: med1._id, batchNo: 'L-1', expiryDate: exp() },
        { medicineId: med2._id, batchNo: 'L-2', expiryDate: exp() },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('received');
    expect(await totalStock(med1._id)).toBe(10);
    expect(await totalStock(med2._id)).toBe(6);
  });

  test('close short marks a partially received order closed; cancel is refused', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 10, unitCost: 1 }]);

    const early = await request(app).post(`/api/procurement/orders/${order._id}/close`).set(auth(A.token)).send({});
    expect(early.status).toBe(400);

    await receive(order._id, { lines: [{ medicineId: med._id, batchNo: 'CS-1', expiryDate: exp(), quantity: 4 }] });

    const cancel = await request(app).patch(`/api/procurement/orders/${order._id}/cancel`).set(auth(A.token));
    expect(cancel.status).toBe(400);

    const close = await request(app).post(`/api/procurement/orders/${order._id}/close`).set(auth(A.token)).send({ reason: 'Supplier out of stock' });
    expect(close.status).toBe(200);
    expect(close.body.order.status).toBe('closed');
    expect(close.body.order.closeReason).toBe('Supplier out of stock');

    const after = await receive(order._id, { lines: [{ medicineId: med._id, batchNo: 'CS-2', expiryDate: exp(), quantity: 1 }] });
    expect(after.status).toBe(400);
  });

  test('receiving a controlled medicine writes a controlled register receive entry', async () => {
    const ControlledEntry = require('../models/ControlledEntry');
    const med = await createMedicine(A.pharmacy._id, { isControlled: true, controlledSchedule: 'II' });
    const plain = await createMedicine(A.pharmacy._id);
    const order = await createOrder([
      { medicineId: med._id, quantityOrdered: 10, unitCost: 3 },
      { medicineId: plain._id, quantityOrdered: 5, unitCost: 1 },
    ]);
    const res = await receive(order._id, {
      lines: [
        { medicineId: med._id, batchNo: 'CTRL-1', expiryDate: exp(), quantity: 6, bonusQuantity: 1 },
        { medicineId: plain._id, batchNo: 'PLN-1', expiryDate: exp(), quantity: 5 },
      ],
    });
    expect(res.status).toBe(200);
    const entries = await ControlledEntry.find({ pharmacyId: A.pharmacy._id, refId: order._id });
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('receive');
    expect(String(entries[0].medicineId)).toBe(String(med._id));
    expect(entries[0].quantityIn).toBe(7);
  });

  test('medicine not on the order is rejected', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const other = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 5, unitCost: 1 }]);
    const res = await receive(order._id, { lines: [{ medicineId: other._id, batchNo: 'X', expiryDate: exp(), quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test('draft orders cannot be received until submitted', async () => {
    const med = await createMedicine(A.pharmacy._id);
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 5, unitCost: 1 }], { status: 'draft' });
    expect(order.status).toBe('draft');
    const res = await receive(order._id, { lines: [{ medicineId: med._id, batchNo: 'D-1', expiryDate: exp(), quantity: 5 }] });
    expect(res.status).toBe(400);
    const sub = await request(app).patch(`/api/procurement/orders/${order._id}/submit`).set(auth(A.token));
    expect(sub.status).toBe(200);
    expect(sub.body.order.status).toBe('ordered');
    const ok = await receive(order._id, { lines: [{ medicineId: med._id, batchNo: 'D-1', expiryDate: exp(), quantity: 5 }] });
    expect(ok.status).toBe(200);
  });
});

// Insert sales directly (only the fields the reorder aggregation reads matter).
async function insertSale(medicineId, quantity, { daysAgo = 1, voided = false } = {}) {
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await Sale.collection.insertOne({
    pharmacyId: A.pharmacy._id,
    invoiceNumber: `T-${uid()}`,
    items: [{ medicineId, name: 'x', batchId: medicineId, batchNo: 'x', quantity, unitPrice: 1, subtotal: quantity }],
    totalAmount: quantity,
    voided,
    createdAt: at,
    updatedAt: at,
  });
}

describe('reorder suggestions (#12)', () => {
  test('suggestion = ceil(avgDaily * (lead + safety)) - stock - onOrder', async () => {
    const med = await createMedicine(A.pharmacy._id, {
      preferredSupplierId: supplier._id, leadTimeDays: 5, reorderSafetyDays: 5, minStockLevel: 0,
    });
    // 90 units sold in the last 30 days -> 3/day; target = 3 * 10 = 30
    await insertSale(med._id, 60, { daysAgo: 2 });
    await insertSale(med._id, 30, { daysAgo: 10 });
    await insertSale(med._id, 500, { daysAgo: 5, voided: true }); // ignored
    await insertSale(med._id, 400, { daysAgo: 45 }); // outside the 30-day window
    // Sellable stock 8 (expired + depleted batches ignored)
    await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 8, expiryDate: daysFromNow(200) });
    await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 50, expiryDate: daysFromNow(-5) });
    // On order 7 (open PO: 10 ordered, 3 received)
    const order = await createOrder([{ medicineId: med._id, quantityOrdered: 10, unitCost: 1 }]);
    await receive(order._id, { lines: [{ medicineId: med._id, batchNo: `OO-${uid()}`, expiryDate: exp(), quantity: 3 }] });
    // stock is now 8 + 3 = 11; on order 7 -> 30 - 11 - 7 = 12

    const res = await request(app).get('/api/reorder/suggestions?days=30').set(auth(A.token));
    expect(res.status).toBe(200);
    const group = res.body.groups.find((g) => g.supplier && String(g.supplier._id) === String(supplier._id));
    expect(group).toBeTruthy();
    const row = group.items.find((i) => String(i.medicineId) === String(med._id));
    expect(row).toBeTruthy();
    expect(row.unitsSold).toBe(90);
    expect(row.avgDailySales).toBe(3);
    expect(row.currentStock).toBe(11);
    expect(row.onOrder).toBe(7);
    expect(row.suggestedQuantity).toBe(12);
    expect(row.unitCost).toBe(1); // last purchase price

    // Over 60 days the older sale counts: (90 + 400) / 60 * 10 = 81.67 -> 82 - 18 = 64
    const res60 = await request(app).get('/api/reorder/suggestions?days=60').set(auth(A.token));
    const row60 = res60.body.groups.flatMap((g) => g.items).find((i) => String(i.medicineId) === String(med._id));
    expect(row60.suggestedQuantity).toBe(64);
  });

  test('well-stocked medicines are excluded; below-min medicines are flagged', async () => {
    const stocked = await createMedicine(A.pharmacy._id, { minStockLevel: 0 });
    await insertSale(stocked._id, 3, { daysAgo: 1 });
    await insertBatchRaw(A.pharmacy._id, stocked._id, { quantity: 1000, expiryDate: daysFromNow(200) });

    const low = await createMedicine(A.pharmacy._id, { minStockLevel: 20 });
    await insertBatchRaw(A.pharmacy._id, low._id, { quantity: 5, expiryDate: daysFromNow(200) });

    const res = await request(app).get('/api/reorder/suggestions').set(auth(A.token));
    expect(res.status).toBe(200);
    const all = res.body.groups.flatMap((g) => g.items);
    expect(all.find((i) => String(i.medicineId) === String(stocked._id))).toBeUndefined();
    const lowRow = all.find((i) => String(i.medicineId) === String(low._id));
    expect(lowRow.belowMinStock).toBe(true);
    expect(lowRow.suggestedQuantity).toBe(15);
    expect(lowRow.unitCost).toBe(5); // batch purchase price from insertBatchRaw
  });

  test('invalid days returns 400', async () => {
    const res = await request(app).get('/api/reorder/suggestions?days=abc').set(auth(A.token));
    expect(res.status).toBe(400);
  });

  test('create-pos groups lines by supplier and defaults unit cost', async () => {
    const m1 = await createMedicine(A.pharmacy._id, { preferredSupplierId: supplier._id, costPrice: 7 });
    const m2 = await createMedicine(A.pharmacy._id, { preferredSupplierId: supplier._id });
    const m3 = await createMedicine(A.pharmacy._id, { preferredSupplierId: supplier2._id });
    const m4 = await createMedicine(A.pharmacy._id); // no preferred supplier: explicit one per line

    const res = await request(app).post('/api/reorder/create-pos').set(auth(A.token)).send({
      lines: [
        { medicineId: m1._id, quantity: 10 },
        { medicineId: m2._id, quantity: 5, unitCost: 3 },
        { medicineId: m3._id, quantity: 8, unitCost: 2 },
        { medicineId: m4._id, quantity: 4, unitCost: 1, supplierId: supplier2._id },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(2);
    const bySupplier = new Map(res.body.orders.map((o) => [String(o.supplierId._id), o]));
    const o1 = bySupplier.get(String(supplier._id));
    const o2 = bySupplier.get(String(supplier2._id));
    expect(o1.status).toBe('draft');
    expect(o1.items).toHaveLength(2);
    expect(o1.items.find((i) => String(i.medicineId) === String(m1._id)).unitCost).toBe(7); // costPrice fallback
    expect(o1.totalAmount).toBe(85);
    expect(o2.items).toHaveLength(2);
    expect(o2.totalAmount).toBe(20);
  });

  test('create-pos with a supplier override and status ordered makes one PO', async () => {
    const m1 = await createMedicine(A.pharmacy._id, { preferredSupplierId: supplier._id });
    const m2 = await createMedicine(A.pharmacy._id);
    const res = await request(app).post('/api/reorder/create-pos').set(auth(A.token)).send({
      supplierId: supplier2._id,
      status: 'ordered',
      lines: [{ medicineId: m1._id, quantity: 1, unitCost: 1 }, { medicineId: m2._id, quantity: 2, unitCost: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
    expect(res.body.orders[0].status).toBe('ordered');
  });

  test('create-pos without a supplier for a line returns 400 and creates nothing', async () => {
    const before = await PurchaseOrder.countDocuments({ pharmacyId: A.pharmacy._id });
    const m1 = await createMedicine(A.pharmacy._id, { preferredSupplierId: supplier._id });
    const m2 = await createMedicine(A.pharmacy._id);
    const res = await request(app).post('/api/reorder/create-pos').set(auth(A.token)).send({
      lines: [{ medicineId: m1._id, quantity: 1 }, { medicineId: m2._id, quantity: 1 }],
    });
    expect(res.status).toBe(400);
    expect(await PurchaseOrder.countDocuments({ pharmacyId: A.pharmacy._id })).toBe(before);
  });
});
