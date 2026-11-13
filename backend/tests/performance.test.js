// Performance-related behaviour: bulk stock-take approval, bounded lists, aggregated stock
// summary / controlled register, report time limits and range caps, dashboard cache and
// CSV export backpressure.
const { EventEmitter } = require('events');
const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const ControlledEntry = require('../models/ControlledEntry');
const PurchaseOrder = require('../models/PurchaseOrder');
const { currentStock } = require('../services/clinical');
const { streamCsv, watchClient } = require('../controllers/exportController');
const { dashboardCache } = require('../controllers/reports/dashboard');

let O; // owner
let B; // other pharmacy

beforeAll(async () => {
  await connectTestDb('performance');
  O = await createPharmacist();
  B = await createPharmacist();
});

afterAll(disconnectTestDb);

// Counts MongoDB operations issued by Mongoose while `fn` runs.
const countDbOps = async (fn) => {
  const ops = [];
  mongoose.set('debug', (collection, method) => ops.push(`${collection}.${method}`));
  try {
    const result = await fn();
    return { result, ops };
  } finally {
    mongoose.set('debug', false);
  }
};

const insertBatches = (pharmacyId, rows) =>
  StockBatch.insertMany(
    rows.map((r, i) => ({
      pharmacyId,
      medicineId: r.medicineId,
      batchNo: r.batchNo || `PB-${uid()}-${i}`,
      quantity: r.quantity,
      initialQuantity: r.quantity,
      expiryDate: r.expiryDate || daysFromNow(200 + (i % 50)),
      purchasePrice: r.purchasePrice ?? 2,
      status: r.status || 'active',
    }))
  );

describe('Stock take approval with bulk writes', () => {
  test('approves a few hundred lines correctly with a constant number of DB round trips', async () => {
    const cat = `Bulk ${uid()}`;
    const meds = [];
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      meds.push(await createMedicine(O.pharmacy._id, { category: cat, isControlled: i < 3, controlledSchedule: i < 3 ? 'II' : undefined }));
    }
    const rows = [];
    meds.forEach((m) => {
      for (let j = 0; j < 10; j += 1) rows.push({ medicineId: m._id, quantity: 10 + j });
    });
    await insertBatches(O.pharmacy._id, rows); // 300 batches

    const start = await request(app).post('/api/stock-takes').set(auth(O.token)).send({ scope: { category: cat } });
    expect(start.status).toBe(201);
    const st = start.body.stockTake;
    expect(st.lines).toHaveLength(300);

    // Pattern per line: -1, +2, 0, uncounted, to zero (depleted)
    const expected = new Map(); // batchId -> expected quantity
    const counts = [];
    st.lines.forEach((l, i) => {
      const k = i % 5;
      if (k === 3) {
        expected.set(l.batchId, l.systemQty);
        return;
      }
      const counted = [l.systemQty - 1, l.systemQty + 2, l.systemQty, null, 0][k];
      counts.push({ batchId: l.batchId, countedQty: counted });
      expected.set(l.batchId, counted);
    });
    const save = await request(app).patch(`/api/stock-takes/${st._id}/counts`).set(auth(O.token)).send({ counts });
    expect(save.status).toBe(200);
    expect((await request(app).post(`/api/stock-takes/${st._id}/submit`).set(auth(O.token))).status).toBe(200);

    const { result: appr, ops } = await countDbOps(() =>
      request(app).post(`/api/stock-takes/${st._id}/approve`).set(auth(O.token))
    );
    expect(appr.status).toBe(200);
    expect(appr.body.stockTake.status).toBe('approved');
    // Per-line round trips would be 900+; bulk approval needs a small constant number.
    expect(ops.length).toBeLessThan(40);
    expect(ops.filter((o) => o === 'stockbatches.findOneAndUpdate')).toHaveLength(0);

    const after = await StockBatch.find({ _id: { $in: [...expected.keys()] } }).lean();
    expect(after).toHaveLength(300);
    after.forEach((b) => {
      expect(b.quantity).toBe(expected.get(String(b._id)));
      expect(b.status).toBe(b.quantity === 0 ? 'depleted' : 'active');
    });

    const movements = await StockMovement.find({ refId: st._id, type: 'stock_take' }).lean();
    expect(movements).toHaveLength(180); // 3 of every 5 lines changed
    movements.forEach((mv) => {
      expect(mv.balanceAfter).toBe(expected.get(String(mv.batchId)));
      expect(mv.refModel).toBe('StockTake');
      expect(String(mv.pharmacyId)).toBe(String(O.pharmacy._id));
    });

    // applied changes on the lines
    const lines = appr.body.stockTake.lines;
    expect(lines.filter((l) => l.appliedChange === null)).toHaveLength(60);
    expect(lines.filter((l) => l.appliedChange === 0)).toHaveLength(60);

    // Controlled register: one 'adjust' entry per changed line of a controlled medicine,
    // running balances ending at the medicine's current stock.
    for (const m of meds.slice(0, 3)) {
      // eslint-disable-next-line no-await-in-loop
      const entries = await ControlledEntry.find({ medicineId: m._id, refId: st._id }).sort({ _id: 1 }).lean();
      expect(entries).toHaveLength(6);
      // eslint-disable-next-line no-await-in-loop
      const stockNow = await currentStock(O.pharmacy._id, m._id);
      expect(entries[entries.length - 1].balanceAfter).toBe(stockNow);
      for (let i = 1; i < entries.length; i += 1) {
        const e = entries[i];
        expect(e.balanceAfter).toBe(entries[i - 1].balanceAfter + e.quantityIn - e.quantityOut);
        expect(e.entryType).toBe('adjust');
      }
    }
    // Non-controlled medicines get no register entries
    expect(await ControlledEntry.countDocuments({ medicineId: meds[5]._id })).toBe(0);
  });

  test('refuses to go negative and changes nothing', async () => {
    const cat = `Neg ${uid()}`;
    const m = await createMedicine(O.pharmacy._id, { category: cat });
    const [a, b] = await insertBatches(O.pharmacy._id, [
      { medicineId: m._id, quantity: 5 },
      { medicineId: m._id, quantity: 8 },
    ]);
    const start = await request(app).post('/api/stock-takes').set(auth(O.token)).send({ scope: { category: cat } });
    const st = start.body.stockTake;
    await request(app).patch(`/api/stock-takes/${st._id}/counts`).set(auth(O.token))
      .send({ counts: [{ batchId: a._id, countedQty: 1 }, { batchId: b._id, countedQty: 10 }] });
    await request(app).post(`/api/stock-takes/${st._id}/submit`).set(auth(O.token));
    // Batch A sold down to 2 meanwhile: applying -4 would make it negative
    await StockBatch.updateOne({ _id: a._id }, { $inc: { quantity: -3 } });

    const appr = await request(app).post(`/api/stock-takes/${st._id}/approve`).set(auth(O.token));
    expect(appr.status).toBe(409);
    expect(appr.body.message).toMatch(/negative/);
    expect((await StockBatch.findById(a._id)).quantity).toBe(2);
    expect((await StockBatch.findById(b._id)).quantity).toBe(8);
    expect(await StockMovement.countDocuments({ refId: st._id })).toBe(0);
    const again = await request(app).get(`/api/stock-takes/${st._id}`).set(auth(O.token));
    expect(again.body.stockTake.status).toBe('submitted');
  });
});

describe('Bounded lists', () => {
  let med;
  let other;
  beforeAll(async () => {
    med = await createMedicine(O.pharmacy._id, { name: `Zinc Listing ${uid()}`, genericName: 'zincum' });
    other = await createMedicine(O.pharmacy._id, { name: `Other Listing ${uid()}` });
    await insertBatches(O.pharmacy._id, [
      { medicineId: med._id, quantity: 4, batchNo: `ZL-A-${uid()}` },
      { medicineId: med._id, quantity: 0, batchNo: `ZL-B-${uid()}`, status: 'depleted' },
      { medicineId: other._id, quantity: 7, batchNo: `OTH-${uid()}` },
    ]);
  });

  test('GET /api/stock excludes empty batches by default, filters and paginates', async () => {
    const def = await request(app).get('/api/stock').query({ medicineId: String(med._id) }).set(auth(O.token));
    expect(def.status).toBe(200);
    expect(def.body.batches).toHaveLength(1);
    expect(def.body.total).toBe(1);
    expect(def.body.page).toBe(1);
    expect(def.body.batches[0].medicineId.name).toBe(med.name);

    const withEmpty = await request(app).get('/api/stock')
      .query({ medicineId: String(med._id), includeEmpty: 'true' }).set(auth(O.token));
    expect(withEmpty.body.total).toBe(2);

    const depleted = await request(app).get('/api/stock')
      .query({ medicineId: String(med._id), status: 'depleted' }).set(auth(O.token));
    expect(depleted.body.batches.map((b) => b.quantity)).toEqual([0]);

    const byName = await request(app).get('/api/stock').query({ q: 'zincum' }).set(auth(O.token));
    expect(byName.body.batches.every((b) => String(b.medicineId._id) === String(med._id))).toBe(true);
    expect(byName.body.total).toBe(1);
    const byBatch = await request(app).get('/api/stock').query({ q: 'OTH-' }).set(auth(O.token));
    expect(byBatch.body.batches.map((b) => String(b.medicineId._id))).toEqual([String(other._id)]);
    const regexy = await request(app).get('/api/stock').query({ q: '(.*' }).set(auth(O.token));
    expect(regexy.status).toBe(200);

    const paged = await request(app).get('/api/stock').query({ limit: 1, page: 2 }).set(auth(O.token));
    expect(paged.body.batches).toHaveLength(1);
    expect(paged.body.limit).toBe(1);
    expect(paged.body.total).toBeGreaterThanOrEqual(2);
    expect(paged.body.truncated).toBe(paged.body.total > 2);
    const capped = await request(app).get('/api/stock').query({ limit: 999999 }).set(auth(O.token));
    expect(capped.body.limit).toBe(2000);

    const bad = await request(app).get('/api/stock').query({ status: 'weird' }).set(auth(O.token));
    expect(bad.status).toBe(400);
    const otherTenant = await request(app).get('/api/stock').query({ q: 'zincum' }).set(auth(B.token));
    expect(otherTenant.body.total).toBe(0);
  });

  test('GET /api/medicines is always bounded, supports ?q= and a picker projection', async () => {
    const prefix = `Bound ${uid()}`;
    await Medicine.insertMany(
      Array.from({ length: 205 }, (_, i) => ({
        pharmacyId: B.pharmacy._id, name: `${prefix} ${String(i).padStart(3, '0')}`, category: 'X', price: 1,
      }))
    );
    const def = await request(app).get('/api/medicines').set(auth(B.token));
    expect(def.status).toBe(200);
    expect(def.body.medicines).toHaveLength(200);
    expect(def.body.total).toBe(205);
    expect(def.body.truncated).toBe(true);
    expect(def.body.medicines[0]).toHaveProperty('marginPercent');

    const more = await request(app).get('/api/medicines').query({ limit: 5000 }).set(auth(B.token));
    expect(more.body.medicines).toHaveLength(205);
    expect(more.body.limit).toBe(1000);

    const picker = await request(app).get('/api/medicines')
      .query({ q: `${prefix} 01`, fields: 'picker', limit: 20 }).set(auth(B.token));
    expect(picker.body.total).toBe(10); // 010..019
    expect(Object.keys(picker.body.medicines[0])).not.toContain('pharmacyId');
    expect(picker.body.medicines[0]).toHaveProperty('costPrice');

    const paged = await request(app).get('/api/medicines').query({ page: 2, limit: 100 }).set(auth(B.token));
    expect(paged.body.medicines).toHaveLength(100);
    expect(paged.body.pages).toBe(3);
  });

  test('GET /api/procurement/orders is bounded and searches supplier names', async () => {
    const supplierRes = await request(app).post('/api/suppliers').set(auth(O.token))
      .send({ name: `Acme Pharma ${uid()}`, phone: '0911000000' });
    expect(supplierRes.status).toBe(201);
    const supplierId = supplierRes.body.supplier._id;
    await PurchaseOrder.insertMany(
      Array.from({ length: 205 }, (_, i) => ({
        pharmacyId: O.pharmacy._id,
        supplierId,
        pharmacistId: O.user._id,
        poNumber: `PO-PERF-${uid()}-${i}`,
        status: 'draft',
        items: [{ medicineId: med._id, name: med.name, quantityOrdered: 1, unitCost: 1, subtotal: 1 }],
        totalAmount: 1,
      }))
    );
    const def = await request(app).get('/api/procurement/orders').set(auth(O.token));
    expect(def.status).toBe(200);
    expect(def.body.orders).toHaveLength(200);
    expect(def.body.total).toBeGreaterThanOrEqual(205);
    expect(def.body.orders[0].supplierId.name).toMatch(/Acme Pharma/);

    const bySupplier = await request(app).get('/api/procurement/orders').query({ q: 'acme pharma', limit: 1000 }).set(auth(O.token));
    expect(bySupplier.body.total).toBe(205);
  });
});

describe('Stock summary and controlled register aggregates', () => {
  test('summary: low stock ignores minStockLevel 0, expiring list is trimmed with a full count', async () => {
    const P = await createPharmacist();
    const noMin = await createMedicine(P.pharmacy._id, { minStockLevel: 0 });
    const low = await createMedicine(P.pharmacy._id, { minStockLevel: 10 });
    const ok = await createMedicine(P.pharmacy._id, { minStockLevel: 5 });
    const archived = await createMedicine(P.pharmacy._id, { minStockLevel: 5, isArchived: true });
    const rows = [
      { medicineId: low._id, quantity: 3, purchasePrice: 2 },
      { medicineId: ok._id, quantity: 50, purchasePrice: 1 },
    ];
    for (let i = 0; i < 55; i += 1) rows.push({ medicineId: ok._id, quantity: 1, purchasePrice: 1, expiryDate: daysFromNow(5 + (i % 20)) });
    await insertBatches(P.pharmacy._id, rows);
    await insertBatchRaw(P.pharmacy._id, low._id, { quantity: 100, expiryDate: daysFromNow(-3) }); // expired: not sellable

    const res = await request(app).get('/api/stock/summary').set(auth(P.token));
    expect(res.status).toBe(200);
    const s = res.body.summary;
    const lowIds = s.lowStockMedicines.map((m) => String(m._id));
    expect(lowIds).toEqual([String(low._id)]);
    expect(lowIds).not.toContain(String(noMin._id));
    expect(lowIds).not.toContain(String(archived._id));
    expect(s.lowStockMedicines[0]).toMatchObject({ currentStock: 3, minStockLevel: 10, name: low.name });
    expect(s.totalBatches).toBe(57);
    expect(s.activeBatchesCount).toBe(57);
    expect(s.totalStockUnits).toBe(3 + 50 + 55);
    expect(s.totalValuation).toBe(6 + 50 + 55);
    expect(s.expiringSoonCount).toBe(55);
    expect(s.expiringSoonBatches).toHaveLength(50);
    expect(s.expiringSoonBatches[0].medicineId.name).toBe(ok.name);
    expect(s.expiredCount).toBe(1);
    expect(s.expiredUnits).toBe(100);
    expect(s.expiredBatches).toHaveLength(1);
  });

  test('controlled medicines and register get stock for every medicine', async () => {
    const P = await createPharmacist();
    const c1 = await createMedicine(P.pharmacy._id, { isControlled: true, controlledSchedule: 'II' });
    const c2 = await createMedicine(P.pharmacy._id, { isControlled: true, controlledSchedule: 'II' });
    await insertBatches(P.pharmacy._id, [
      { medicineId: c1._id, quantity: 4 },
      { medicineId: c1._id, quantity: 6 },
      { medicineId: c2._id, quantity: 0, status: 'depleted' },
    ]);
    await ControlledEntry.create({
      pharmacyId: P.pharmacy._id, medicineId: c1._id, entryType: 'receive', quantityIn: 10, balanceAfter: 10,
      date: daysFromNow(-10),
    });
    const list = await request(app).get('/api/controlled/medicines').set(auth(P.token));
    expect(list.status).toBe(200);
    const byId = new Map(list.body.medicines.map((m) => [String(m._id), m.currentStock]));
    expect(byId.get(String(c1._id))).toBe(10);
    expect(byId.get(String(c2._id))).toBe(0);

    const reg = await request(app).get('/api/controlled/register')
      .query({ from: daysFromNow(-1).toISOString().slice(0, 10) }).set(auth(P.token));
    expect(reg.status).toBe(200);
    const g1 = reg.body.groups.find((g) => String(g.medicine._id) === String(c1._id));
    expect(g1.openingBalance).toBe(10);
    expect(g1.currentStock).toBe(10);
    const g2 = reg.body.groups.find((g) => String(g.medicine._id) === String(c2._id));
    expect(g2.openingBalance).toBe(0);
  });
});

describe('Report limits', () => {
  test('custom ranges over 3 years are refused; range=all is capped to 3 years', async () => {
    const tooLong = await request(app).get('/api/reports/profit')
      .query({ range: 'custom', from: '2020-01-01', to: '2024-06-01' }).set(auth(O.token));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toMatch(/at most 3 years/);

    const all = await request(app).get('/api/reports/profit').query({ range: 'all' }).set(auth(O.token));
    expect(all.status).toBe(200);
    expect(all.body.report.rangeLabel).toBe('Last 3 years');
    const from = new Date(all.body.report.from);
    const years = (Date.now() - from.getTime()) / (365.25 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(2.9);
    expect(years).toBeLessThan(3.1);

    const ok = await request(app).get('/api/reports/profit')
      .query({ range: 'custom', from: '2024-01-01', to: '2026-06-01' }).set(auth(O.token));
    expect(ok.status).toBe(200);
  });

  test('a MongoDB time-out (MaxTimeMSExpired) becomes a friendly 503', async () => {
    const err = Object.assign(new Error('operation exceeded time limit'), { code: 50, codeName: 'MaxTimeMSExpired' });
    const spy = jest.spyOn(mongoose.Aggregate.prototype, 'exec').mockRejectedValue(err);
    try {
      const res = await request(app).get('/api/reports/sales-by-staff').set(auth(O.token));
      expect(res.status).toBe(503);
      expect(res.body.message).toMatch(/taking too long/);
    } finally {
      spy.mockRestore();
    }
    const after = await request(app).get('/api/reports/sales-by-staff').set(auth(O.token));
    expect(after.status).toBe(200);
  });

  test('report aggregations carry maxTimeMS', async () => {
    const seen = [];
    const orig = mongoose.Aggregate.prototype.exec;
    const spy = jest.spyOn(mongoose.Aggregate.prototype, 'exec').mockImplementation(function exec(...args) {
      seen.push(this.options.maxTimeMS);
      return orig.apply(this, args);
    });
    try {
      const res = await request(app).get('/api/reports/analytics').query({ range: '7d' }).set(auth(O.token));
      expect(res.status).toBe(200);
    } finally {
      spy.mockRestore();
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((ms) => ms === 20000)).toBe(true);
  });

  test('dashboard overview is cached per pharmacy for the TTL', async () => {
    const P = await createPharmacist();
    dashboardCache.ttlMs = 60000;
    try {
      const first = await request(app).get('/api/reports/overview').set(auth(P.token));
      expect(first.status).toBe(200);
      const { ops } = await countDbOps(() => request(app).get('/api/reports/overview').set(auth(P.token)));
      expect(ops.filter((o) => o.endsWith('.aggregate'))).toHaveLength(0);
      // Another pharmacy is not served from P's cache entry
      const other = await request(app).get('/api/reports/overview').set(auth(B.token));
      expect(other.body.overview.pharmacy.name).toBe(B.pharmacy.name);
    } finally {
      dashboardCache.ttlMs = 0;
      dashboardCache.clear();
    }
  });
});

describe('CSV export streaming', () => {
  // Minimal writable response: write() reports a full buffer every `every` writes.
  const mockRes = ({ every = 2 } = {}) => {
    const res = new EventEmitter();
    res.chunks = [];
    res.writableFinished = false;
    res.ended = false;
    let n = 0;
    res.write = (chunk) => {
      res.chunks.push(chunk);
      n += 1;
      if (n % every === 0) {
        setImmediate(() => res.emit('drain'));
        return false;
      }
      return true;
    };
    res.end = () => {
      res.ended = true;
      res.writableFinished = true;
      res.emit('finish');
      res.emit('close');
    };
    return res;
  };

  const mockCursor = (docs, hooks = {}) => {
    const cursor = {
      closed: false,
      pulled: 0,
      async close() {
        cursor.closed = true;
      },
      async *[Symbol.asyncIterator]() {
        for (const d of docs) {
          if (cursor.closed) return;
          cursor.pulled += 1;
          if (hooks.onPull) hooks.onPull(cursor.pulled);
          yield d;
        }
      },
    };
    return cursor;
  };

  const sheet = { columns: [{ header: 'Name', key: 'name' }], map: (d) => ({ name: d.name }) };

  test('waits for drain when the buffer is full and writes every row', async () => {
    const res = mockRes({ every: 2 });
    const conn = watchClient(new EventEmitter(), res);
    const docs = Array.from({ length: 25 }, (_, i) => ({ name: `row${i}` }));
    let drains = 0;
    res.on('drain', () => { drains += 1; });
    await streamCsv(res, mockCursor(docs), sheet, conn);
    expect(res.ended).toBe(true);
    expect(drains).toBeGreaterThan(5);
    const text = res.chunks.join('');
    expect(text.split('\n').filter(Boolean)).toHaveLength(26);
    expect(text).toContain('row24');
  });

  test('stops reading and closes the cursor when the client disconnects', async () => {
    const res = mockRes({ every: 1000 });
    const req = new EventEmitter();
    const conn = watchClient(req, res);
    const docs = Array.from({ length: 100 }, (_, i) => ({ name: `row${i}` }));
    const cursor = mockCursor(docs, {
      onPull: (n) => {
        if (n === 10) res.emit('close'); // client went away mid-download
      },
    });
    await streamCsv(res, cursor, sheet, conn);
    expect(cursor.closed).toBe(true);
    expect(cursor.pulled).toBeLessThan(15);
    expect(res.ended).toBe(false);
  });

  test('a disconnect while waiting for drain does not hang', async () => {
    const res = mockRes({ every: 1 });
    res.write = (chunk) => {
      res.chunks.push(chunk);
      setImmediate(() => res.emit('close')); // never drains
      return false;
    };
    const conn = watchClient(new EventEmitter(), res);
    const cursor = mockCursor([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    await streamCsv(res, cursor, sheet, conn);
    expect(cursor.closed).toBe(true);
    expect(res.chunks.length).toBeLessThanOrEqual(2);
  });
});
