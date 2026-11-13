// Stock integrity fixes: weighted average cost on merged receipts, transfer medicine matching,
// controlled register on transfers, atomic stock-take transitions, expired vs depleted.
const {
  app, request, auth, uid, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const StockTake = require('../models/StockTake');
const ControlledEntry = require('../models/ControlledEntry');
const { weightedAverageCost } = require('../controllers/purchaseOrders/helpers');

let O; // owner of pharmacy A and branch B
let A;
let B;
let supplier;

const as = (token, pharmacyId) => ({ ...auth(token), 'x-pharmacy-id': String(pharmacyId) });
const exp = (days = 365) => daysFromNow(days).toISOString();

beforeAll(async () => {
  await connectTestDb('stockintegrity');
  O = await createPharmacist();
  A = O.pharmacy;
  const br = await request(app).post('/api/branches').set(as(O.token, A._id)).send({
    name: `Branch B ${uid()}`, address: '2 Test St', phone: '0911', licenseNo: `LB-${uid()}`,
  });
  if (br.status !== 201) throw new Error(`branch create failed ${br.status} ${JSON.stringify(br.body)}`);
  B = br.body.branch;
  const sup = await request(app).post('/api/suppliers').set(as(O.token, A._id)).send({ name: 'Alpha', phone: '0911000111' });
  if (sup.status !== 201) throw new Error(`supplier failed ${sup.status}`);
  supplier = sup.body.supplier;
});

afterAll(disconnectTestDb);

describe('weighted average cost when merging into an existing batch', () => {
  test('helper formula (bonus units at zero cost)', () => {
    expect(weightedAverageCost({ onHandQty: 100, onHandCost: 5, paidQty: 10, paidCost: 8 })).toBeCloseTo(5.2727, 4);
    expect(weightedAverageCost({ onHandQty: 100, onHandCost: 5, paidQty: 0, paidCost: 8, bonusQty: 25 })).toBe(4);
    expect(weightedAverageCost({ onHandQty: 0, onHandCost: 5, paidQty: 10, paidCost: 8 })).toBe(8);
  });

  test('PO receive into an existing batch averages the cost and records it in the movement', async () => {
    const med = await createMedicine(A._id, { costPrice: 5 });
    const batch = await insertBatchRaw(A._id, med._id, { batchNo: 'W-1', quantity: 100, expiryDate: daysFromNow(300) });
    const expiry = batch.expiryDate.toISOString();

    const po = await request(app).post('/api/procurement/orders').set(as(O.token, A._id))
      .send({ supplierId: supplier._id, items: [{ medicineId: med._id, quantityOrdered: 20, unitCost: 8 }] });
    expect(po.status).toBe(201);

    const r1 = await request(app).patch(`/api/procurement/orders/${po.body.order._id}/receive`).set(as(O.token, A._id))
      .send({ lines: [{ medicineId: med._id, batchNo: 'W-1', expiryDate: expiry, quantity: 10 }] });
    expect(r1.status).toBe(200);
    let b = await StockBatch.findById(batch._id);
    expect(b.quantity).toBe(110);
    expect(b.purchasePrice).toBeCloseTo(5.2727, 4); // (100*5 + 10*8) / 110, not 8

    const mv = await StockMovement.findOne({ batchId: batch._id, type: 'purchase_receive' }).lean();
    expect(mv.meta).toEqual({ costBefore: 5, costAfter: b.purchasePrice });

    // 10 paid @ 8 + 10 bonus: bonus units lower the cost
    const r2 = await request(app).patch(`/api/procurement/orders/${po.body.order._id}/receive`).set(as(O.token, A._id))
      .send({ lines: [{ medicineId: med._id, batchNo: 'W-1', expiryDate: expiry, quantity: 10, bonusQuantity: 10 }] });
    expect(r2.status).toBe(200);
    const prev = b.purchasePrice;
    b = await StockBatch.findById(batch._id);
    expect(b.quantity).toBe(130);
    expect(b.purchasePrice).toBeCloseTo((110 * prev + 10 * 8) / 130, 3);

    // Medicine-level cost price is not touched by receiving
    expect((await Medicine.findById(med._id)).costPrice).toBe(5);
  });

  test('stock-in into an existing batch averages the cost; without a price the cost is kept', async () => {
    const med = await createMedicine(A._id);
    const batch = await insertBatchRaw(A._id, med._id, { batchNo: 'S-1', quantity: 100, expiryDate: daysFromNow(300) });
    const expiry = batch.expiryDate.toISOString();

    const r = await request(app).post('/api/stock').set(as(O.token, A._id))
      .send({ medicineId: med._id, batchNo: 'S-1', quantity: 100, expiryDate: expiry, purchasePrice: 7 });
    expect(r.status).toBe(201);
    let b = await StockBatch.findById(batch._id);
    expect(b.quantity).toBe(200);
    expect(b.purchasePrice).toBe(6);
    const mv = await StockMovement.findOne({ batchId: batch._id, type: 'stock_in' }).lean();
    expect(mv.meta).toEqual({ costBefore: 5, costAfter: 6 });

    const r2 = await request(app).post('/api/stock').set(as(O.token, A._id))
      .send({ medicineId: med._id, batchNo: 'S-1', quantity: 50, expiryDate: expiry });
    expect(r2.status).toBe(201);
    b = await StockBatch.findById(batch._id);
    expect(b.quantity).toBe(250);
    expect(b.purchasePrice).toBe(6);
  });
});

describe('transfer receive medicine matching', () => {
  const sendAndReceive = async (srcMed, quantity = 5) => {
    const batch = await insertBatchRaw(A._id, srcMed._id, { batchNo: `T-${uid()}`, quantity: 50, expiryDate: daysFromNow(200) });
    const send = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: srcMed._id, batchId: batch._id, quantity }] });
    expect(send.status).toBe(201);
    const recv = await request(app).post(`/api/transfers/${send.body.transfer._id}/receive`).set(as(O.token, B._id));
    return { send, recv, batch };
  };

  test('same name, different base unit at the destination -> 409, nothing moved', async () => {
    const name = `Paracetamol ${uid()}`;
    const src = await createMedicine(A._id, { name, strength: '500mg', baseUnit: 'tablet' });
    const dest = await createMedicine(B._id, { name, strength: '500mg', baseUnit: 'strip' });
    const { recv, send } = await sendAndReceive(src);
    expect(recv.status).toBe(409);
    expect(recv.body.message).toMatch(/base unit/i);
    expect(recv.body.message).toContain(dest.name);
    expect(await StockBatch.countDocuments({ pharmacyId: B._id, medicineId: dest._id })).toBe(0);
    const t = await request(app).get(`/api/transfers/${send.body.transfer._id}`).set(as(O.token, A._id));
    expect(t.body.transfer.status).toBe('in_transit');
  });

  test('same name, different pack factor -> 409', async () => {
    const name = `Ibuprofen ${uid()}`;
    const src = await createMedicine(A._id, { name, packUnits: [{ name: 'box', factor: 100 }] });
    await createMedicine(B._id, { name, packUnits: [{ name: 'box', factor: 50 }] });
    const { recv } = await sendAndReceive(src);
    expect(recv.status).toBe(409);
    expect(recv.body.message).toMatch(/pack "box"/);
  });

  test('same name, different strength -> 409', async () => {
    const name = `Amoxicillin ${uid()}`;
    const src = await createMedicine(A._id, { name, strength: '500mg' });
    await createMedicine(B._id, { name, strength: '250mg' });
    const { recv } = await sendAndReceive(src);
    expect(recv.status).toBe(409);
    expect(recv.body.message).toMatch(/250mg/);
  });

  test('barcode match with a different name is used', async () => {
    const barcode = `BC${uid()}`;
    const src = await createMedicine(A._id, { name: `Panadol ${uid()}`, barcode });
    const dest = await createMedicine(B._id, { name: `Paracetamol local ${uid()}`, barcode });
    const { recv } = await sendAndReceive(src, 7);
    expect(recv.status).toBe(200);
    expect(String(recv.body.transfer.lines[0].destMedicineId)).toBe(String(dest._id));
    const batches = await StockBatch.find({ pharmacyId: B._id, medicineId: dest._id });
    expect(batches.reduce((s, b) => s + b.quantity, 0)).toBe(7);
  });

  test('normal case: matching name/strength merges; unknown medicine is copied with units', async () => {
    const name = `Cetirizine ${uid()}`;
    const src = await createMedicine(A._id, { name, strength: '10mg', baseUnit: 'tablet' });
    const dest = await createMedicine(B._id, { name: name.toUpperCase(), strength: '10mg', baseUnit: 'Tablet' });
    const r1 = await sendAndReceive(src, 3);
    expect(r1.recv.status).toBe(200);
    expect(String(r1.recv.body.transfer.lines[0].destMedicineId)).toBe(String(dest._id));

    const fresh = await createMedicine(A._id, {
      name: `Fresh ${uid()}`, baseUnit: 'ml', packUnits: [{ name: 'bottle', factor: 100, price: 50 }],
    });
    const r2 = await sendAndReceive(fresh, 4);
    expect(r2.recv.status).toBe(200);
    const copy = await Medicine.findById(r2.recv.body.transfer.lines[0].destMedicineId);
    expect(String(copy.pharmacyId)).toBe(String(B._id));
    expect(copy.baseUnit).toBe('ml');
    expect(copy.packUnits.map((p) => [p.name, p.factor])).toEqual([['bottle', 100]]);
  });
});

describe('controlled register on transfers', () => {
  test('send records out at the source, receive records in at the destination', async () => {
    const src = await createMedicine(A._id, { name: `Morphine ${uid()}`, isControlled: true, controlledSchedule: 'II' });
    const batch = await insertBatchRaw(A._id, src._id, { batchNo: 'M-1', quantity: 30, expiryDate: daysFromNow(200) });
    const send = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: src._id, batchId: batch._id, quantity: 12 }] });
    expect(send.status).toBe(201);
    const tid = send.body.transfer._id;

    const out = await ControlledEntry.find({ pharmacyId: A._id, refId: tid }).lean();
    expect(out).toHaveLength(1);
    expect(out[0].quantityOut).toBe(12);
    expect(out[0].balanceAfter).toBe(18);
    expect(['transfer_out', 'adjust']).toContain(out[0].entryType);
    expect(out[0].notes).toMatch(/Transfer .* sent/);

    const recv = await request(app).post(`/api/transfers/${tid}/receive`).set(as(O.token, B._id));
    expect(recv.status).toBe(200);
    const inn = await ControlledEntry.find({ pharmacyId: B._id, refId: tid }).lean();
    expect(inn).toHaveLength(1);
    expect(inn[0].quantityIn).toBe(12);
    expect(inn[0].balanceAfter).toBe(12);
    expect(['transfer_in', 'receive']).toContain(inn[0].entryType);
  });

  test('cancelling an in-transit transfer records the stock coming back', async () => {
    const src = await createMedicine(A._id, { name: `Codeine ${uid()}`, isControlled: true });
    const batch = await insertBatchRaw(A._id, src._id, { batchNo: 'C-1', quantity: 10, expiryDate: daysFromNow(200) });
    const send = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: src._id, batchId: batch._id, quantity: 10 }] });
    expect(send.status).toBe(201);
    const cancel = await request(app).post(`/api/transfers/${send.body.transfer._id}/cancel`).set(as(O.token, A._id));
    expect(cancel.status).toBe(200);
    const entries = await ControlledEntry.find({ pharmacyId: A._id, refId: send.body.transfer._id }).sort({ _id: 1 }).lean();
    expect(entries.map((e) => [e.quantityOut, e.quantityIn, e.balanceAfter])).toEqual([[10, 0, 0], [0, 10, 10]]);
  });
});

describe('stock-take status transitions are atomic', () => {
  const start = async () => {
    const category = `Cat ${uid()}`;
    const m1 = await createMedicine(A._id, { category });
    const m2 = await createMedicine(A._id, { category });
    await insertBatchRaw(A._id, m1._id, { quantity: 10, expiryDate: daysFromNow(200) });
    await insertBatchRaw(A._id, m2._id, { quantity: 20, expiryDate: daysFromNow(200) });
    const res = await request(app).post('/api/stock-takes').set(as(O.token, A._id)).send({ scope: { category } });
    expect(res.status).toBe(201);
    return res.body.stockTake;
  };
  const call = (method, st, action, body) =>
    request(app)[method](`/api/stock-takes/${st._id}/${action}`).set(as(O.token, A._id)).send(body);

  test('concurrent count saves on different lines both persist', async () => {
    const st = await start();
    const [r1, r2] = await Promise.all([
      call('patch', st, 'counts', { counts: [{ lineId: st.lines[0]._id, countedQty: 9 }] }),
      call('patch', st, 'counts', { counts: [{ lineId: st.lines[1]._id, countedQty: 21 }] }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const saved = await StockTake.findById(st._id);
    expect(saved.lines.map((l) => l.countedQty).sort((a, b) => a - b)).toEqual([9, 21]);
    expect(saved.lines.find((l) => l.countedQty === 9).variance).toBe(-1);
  });

  test('submit needs a count; reopen/cancel/approve refuse when the status already moved', async () => {
    const st = await start();
    expect((await call('post', st, 'submit')).status).toBe(400);
    await call('patch', st, 'counts', { counts: [{ lineId: st.lines[0]._id, countedQty: 8 }] });
    expect((await call('post', st, 'submit')).status).toBe(200);
    expect((await call('patch', st, 'counts', { counts: [{ lineId: st.lines[0]._id, countedQty: 1 }] })).status).toBe(409);
    expect((await call('post', st, 'submit')).status).toBe(409);
    expect((await call('post', st, 'reopen')).status).toBe(200);
    expect((await call('post', st, 'reopen')).status).toBe(409);
    expect((await call('post', st, 'submit')).status).toBe(200);
    expect((await call('post', st, 'cancel')).status).toBe(200);
    expect((await call('post', st, 'approve')).status).toBe(409);
    expect((await call('post', st, 'cancel')).status).toBe(409);
    expect((await StockTake.findById(st._id)).status).toBe('cancelled');
  });

  test('a cancel racing an approve never leaves an approved take cancelled', async () => {
    for (let i = 0; i < 3; i += 1) {
      const st = await start();
      await call('patch', st, 'counts', { counts: [{ lineId: st.lines[0]._id, countedQty: 7 }] });
      expect((await call('post', st, 'submit')).status).toBe(200);
      const [appr, canc] = await Promise.all([call('post', st, 'approve'), call('post', st, 'cancel')]);
      const final = await StockTake.findById(st._id);
      const batch = await StockBatch.findById(st.lines[0].batchId);
      if (final.status === 'approved') {
        expect(appr.status).toBe(200);
        expect(canc.status).toBe(409);
        expect(batch.quantity).toBe(st.lines[0].systemQty - (st.lines[0].systemQty - 7));
      } else {
        expect(final.status).toBe('cancelled');
        expect(canc.status).toBe(200);
        expect(appr.status).toBe(409);
        expect(batch.quantity).toBe(st.lines[0].systemQty);
      }
    }
  });
});

describe('expired adjustment status', () => {
  test('emptying an in-date batch with type expired marks it depleted, a past-expiry one expired', async () => {
    const med = await createMedicine(A._id);
    const inDate = await insertBatchRaw(A._id, med._id, { quantity: 5, expiryDate: daysFromNow(100) });
    const past = await insertBatchRaw(A._id, med._id, { quantity: 5, expiryDate: daysFromNow(-3) });

    const r1 = await request(app).patch(`/api/stock/${inDate._id}/adjust`).set(as(O.token, A._id))
      .send({ adjustmentType: 'expired', reduceQty: 5 });
    expect(r1.status).toBe(200);
    expect(r1.body.batch.status).toBe('depleted');

    const r2 = await request(app).patch(`/api/stock/${past._id}/adjust`).set(as(O.token, A._id))
      .send({ adjustmentType: 'expired', reduceQty: 5 });
    expect(r2.status).toBe(200);
    expect(r2.body.batch.status).toBe('expired');
  });
});
