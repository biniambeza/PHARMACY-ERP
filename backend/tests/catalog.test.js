// Catalog module tests: barcode lookup, pack units, price management, stock take,
// movements and import (#3, #11, #13, #14, #15, #28).

// No role currently has medicine:manage without price:manage. To test the
// price restriction, give 'storekeeper' medicine:manage in this test file only.
jest.mock('../config/permissions', () => {
  const actual = jest.requireActual('../config/permissions');
  return {
    ...actual,
    can: (role, perm) => (role === 'storekeeper' && perm === 'medicine:manage') || actual.can(role, perm),
  };
});

const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine,
} = require('./helpers');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const PriceHistory = require('../models/PriceHistory');
const { ean13CheckDigit } = require('../services/catalog');

let O; // owner
let B; // another pharmacy
let cashierToken;
let storekeeperToken;

const addStaff = async (role) => {
  const email = `${role}_${uid()}@example.com`;
  const res = await request(app).post('/api/staff').set(auth(O.token))
    .send({ name: `${role} ${uid()}`, email, password: PASSWORD, role });
  if (res.status !== 201) throw new Error(`staff create failed ${res.status} ${JSON.stringify(res.body)}`);
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return login.body.token;
};

beforeAll(async () => {
  await connectTestDb('catalog');
  O = await createPharmacist();
  B = await createPharmacist();
  cashierToken = await addStaff('cashier');
  storekeeperToken = await addStaff('storekeeper');
});

afterAll(disconnectTestDb);

describe('Barcodes and lookup (#3, #13)', () => {
  let med;
  beforeAll(async () => {
    const res = await request(app).post('/api/medicines').set(auth(O.token)).send({
      name: `Amox ${uid()}`, category: 'Antibiotics', price: 2, costPrice: 1,
      barcode: '1234567890128', sku: 'AMX-500', baseUnit: 'tablet',
      packUnits: [{ name: 'strip', factor: 10, price: 18, barcode: '9990000000011' }, { name: 'box', factor: 100 }],
    });
    expect(res.status).toBe(201);
    med = res.body.medicine;
  });

  test('lookup by main barcode returns base unit', async () => {
    const res = await request(app).get('/api/medicines/lookup').query({ code: '1234567890128' }).set(auth(O.token));
    expect(res.status).toBe(200);
    expect(res.body.medicine._id).toBe(med._id);
    expect(res.body.unit).toEqual({ name: 'tablet', factor: 1, price: 2 });
  });

  test('lookup by pack barcode returns the pack unit and price', async () => {
    const res = await request(app).get('/api/medicines/lookup').query({ code: '9990000000011' }).set(auth(cashierToken));
    expect(res.status).toBe(200);
    expect(res.body.unit).toEqual({ name: 'strip', factor: 10, price: 18 });
  });

  test('lookup by SKU, unknown code 404, other pharmacy cannot see it', async () => {
    const sku = await request(app).get('/api/medicines/lookup').query({ code: 'amx-500' }).set(auth(O.token));
    expect(sku.status).toBe(200);
    const none = await request(app).get('/api/medicines/lookup').query({ code: '000' }).set(auth(O.token));
    expect(none.status).toBe(404);
    const other = await request(app).get('/api/medicines/lookup').query({ code: '1234567890128' }).set(auth(B.token));
    expect(other.status).toBe(404);
  });

  test('duplicate barcode (main or pack) is rejected with 409', async () => {
    const dupMain = await request(app).post('/api/medicines').set(auth(O.token)).send({
      name: `Dup ${uid()}`, category: 'X', price: 1, barcode: '9990000000011',
    });
    expect(dupMain.status).toBe(409);
    expect(dupMain.body.message).toMatch(/already used/);
    const other = await createMedicine(O.pharmacy._id);
    const dupPack = await request(app).put(`/api/medicines/${other._id}`).set(auth(O.token)).send({
      packUnits: [{ name: 'box', factor: 20, barcode: '1234567890128' }],
    });
    expect(dupPack.status).toBe(409);
    const dupSku = await request(app).put(`/api/medicines/${other._id}`).set(auth(O.token)).send({ sku: 'AMX-500' });
    expect(dupSku.status).toBe(409);
    // Another pharmacy may use the same barcode
    const otherPharmacy = await request(app).post('/api/medicines').set(auth(B.token)).send({
      name: `B ${uid()}`, category: 'X', price: 1, barcode: '1234567890128',
    });
    expect(otherPharmacy.status).toBe(201);
  });

  test('pack unit validation: factor >= 2 integer, unique names', async () => {
    const bad = await request(app).put(`/api/medicines/${med._id}`).set(auth(O.token))
      .send({ packUnits: [{ name: 'strip', factor: 1 }] });
    expect(bad.status).toBe(400);
    const dup = await request(app).put(`/api/medicines/${med._id}`).set(auth(O.token))
      .send({ packUnits: [{ name: 'Box', factor: 10 }, { name: 'box', factor: 20 }] });
    expect(dup.status).toBe(400);
  });

  test('generate internal EAN-13 barcode', async () => {
    const m = await createMedicine(O.pharmacy._id);
    const res = await request(app).post(`/api/medicines/${m._id}/generate-barcode`).set(auth(O.token));
    expect(res.status).toBe(200);
    expect(res.body.barcode).toMatch(/^2\d{12}$/);
    expect(res.body.barcode.slice(-1)).toBe(ean13CheckDigit(res.body.barcode.slice(0, 12)));
    const again = await request(app).post(`/api/medicines/${m._id}/generate-barcode`).set(auth(O.token));
    expect(again.status).toBe(409);
  });

  test('stock-in in a pack unit is converted to base units', async () => {
    const res = await request(app).post('/api/stock').set(auth(O.token)).send({
      medicineId: med._id, batchNo: 'PK-1', quantity: 3, unitName: 'strip',
      expiryDate: daysFromNow(300).toISOString(), purchasePrice: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.batch.quantity).toBe(30);
    expect(res.body.batch.purchasePrice).toBe(1);
  });
});

describe('Price management (#14)', () => {
  test('price change creates history; margin warnings computed', async () => {
    const m = await createMedicine(O.pharmacy._id, { price: 10, costPrice: 8, minMarginPercent: 40 });
    const res = await request(app).put(`/api/medicines/${m._id}`).set(auth(O.token))
      .send({ price: 12, priceChangeReason: 'supplier increase' });
    expect(res.status).toBe(200);
    expect(res.body.medicine.marginWarning).toBe('below_min_margin');
    const hist = await request(app).get(`/api/medicines/${m._id}/price-history`).set(auth(O.token));
    expect(hist.status).toBe(200);
    expect(hist.body.history).toHaveLength(1);
    expect(hist.body.history[0]).toMatchObject({ field: 'price', old: 10, new: 12, reason: 'supplier increase' });

    const below = await request(app).put(`/api/medicines/${m._id}`).set(auth(O.token)).send({ price: 7 });
    expect(below.body.medicine.marginWarning).toBe('below_cost');
  });

  test('medicine:manage without price:manage cannot change prices, but can edit other fields', async () => {
    const m = await createMedicine(O.pharmacy._id, { price: 10 });
    const blocked = await request(app).put(`/api/medicines/${m._id}`).set(auth(storekeeperToken)).send({ price: 11 });
    expect(blocked.status).toBe(403);
    const ok = await request(app).put(`/api/medicines/${m._id}`).set(auth(storekeeperToken))
      .send({ strength: '500mg', price: 10 });
    expect(ok.status).toBe(200);
    expect((await Medicine.findById(m._id)).price).toBe(10);
    const cashier = await request(app).put(`/api/medicines/${m._id}`).set(auth(cashierToken)).send({ price: 11 });
    expect(cashier.status).toBe(403);
    const bulk = await request(app).post('/api/medicines/bulk-price').set(auth(storekeeperToken))
      .send({ filter: { ids: [m._id] }, mode: 'set', value: 1 });
    expect(bulk.status).toBe(403);
  });

  test('bulk price preview and apply by category with rounding', async () => {
    const cat = `Bulk ${uid()}`;
    const a = await createMedicine(O.pharmacy._id, { category: cat, price: 10, costPrice: 9 });
    const b = await createMedicine(O.pharmacy._id, { category: cat, price: 3.3, costPrice: 1 });
    const body = { filter: { category: cat }, mode: 'percent', value: 10, roundTo: 0.5, reason: 'inflation' };
    const preview = await request(app).post('/api/medicines/bulk-price/preview').set(auth(O.token)).send(body);
    expect(preview.status).toBe(200);
    expect(preview.body.count).toBe(2);
    const pa = preview.body.items.find((i) => i._id === String(a._id));
    expect(pa.new).toBe(11);
    expect((await Medicine.findById(a._id)).price).toBe(10); // preview does not save

    const apply = await request(app).post('/api/medicines/bulk-price').set(auth(O.token)).send(body);
    expect(apply.status).toBe(200);
    expect(apply.body.updated).toBe(2);
    expect((await Medicine.findById(a._id)).price).toBe(11);
    expect((await Medicine.findById(b._id)).price).toBe(3.5);
    const rows = await PriceHistory.find({ medicineId: { $in: [a._id, b._id] }, source: 'bulk' });
    expect(rows).toHaveLength(2);

    const noFilter = await request(app).post('/api/medicines/bulk-price').set(auth(O.token))
      .send({ mode: 'set', value: 1 });
    expect(noFilter.status).toBe(400);
  });
});

describe('Stock take (#11) and movements (#15)', () => {
  test('approve applies variance (relative to current qty) with stock_take movements', async () => {
    const cat = `ST ${uid()}`;
    const m = await createMedicine(O.pharmacy._id, { category: cat });
    const inA = await request(app).post('/api/stock').set(auth(O.token)).send({
      medicineId: m._id, batchNo: 'STA', quantity: 20, expiryDate: daysFromNow(200).toISOString(), purchasePrice: 2,
    });
    const inB = await request(app).post('/api/stock').set(auth(O.token)).send({
      medicineId: m._id, batchNo: 'STB', quantity: 5, expiryDate: daysFromNow(300).toISOString(), purchasePrice: 3,
    });
    const batchA = inA.body.batch._id;
    const batchB = inB.body.batch._id;

    const start = await request(app).post('/api/stock-takes').set(auth(storekeeperToken)).send({ scope: { category: cat } });
    expect(start.status).toBe(201);
    const st = start.body.stockTake;
    expect(st.number).toMatch(/^ST-/);
    expect(st.lines).toHaveLength(2);

    const save = await request(app).patch(`/api/stock-takes/${st._id}/counts`).set(auth(O.token))
      .send({ counts: [{ batchId: batchA, countedQty: 17 }, { batchId: batchB, countedQty: 6 }] });
    expect(save.status).toBe(200);
    expect(save.body.stockTake.summary.netVarianceValue).toBe(-3); // -3*2 + 1*3

    // A sale-like change during counting: batch A drops by 2
    await StockBatch.updateOne({ _id: batchA }, { $inc: { quantity: -2 } });

    const cashierTry = await request(app).post(`/api/stock-takes/${st._id}/submit`).set(auth(cashierToken));
    expect(cashierTry.status).toBe(403);
    const sub = await request(app).post(`/api/stock-takes/${st._id}/submit`).set(auth(O.token));
    expect(sub.status).toBe(200);
    const appr = await request(app).post(`/api/stock-takes/${st._id}/approve`).set(auth(O.token));
    expect(appr.status).toBe(200);
    expect(appr.body.stockTake.status).toBe('approved');

    expect((await StockBatch.findById(batchA)).quantity).toBe(15); // 18 current + (-3)
    expect((await StockBatch.findById(batchB)).quantity).toBe(6);
    const movements = await StockMovement.find({ refId: st._id, type: 'stock_take' });
    expect(movements).toHaveLength(2);

    const again = await request(app).post(`/api/stock-takes/${st._id}/approve`).set(auth(O.token));
    expect(again.status).toBe(409);

    const ledger = await request(app).get('/api/movements').query({ medicineId: String(m._id), type: 'stock_take' })
      .set(auth(O.token));
    expect(ledger.status).toBe(200);
    expect(ledger.body.total).toBe(2);
    expect(ledger.body.movements[0].medicineId.name).toBe(m.name);
    const badType = await request(app).get('/api/movements').query({ type: 'nope' }).set(auth(O.token));
    expect(badType.status).toBe(400);
    const cashierLedger = await request(app).get('/api/movements').set(auth(cashierToken));
    expect(cashierLedger.status).toBe(403);
  });
});

describe('Import (#28)', () => {
  test('medicine import dry-run reports per-row errors, commit is all-or-nothing', async () => {
    const existing = await createMedicine(O.pharmacy._id);
    const rows = [
      { Name: `Imp ${uid()}`, Category: 'Analgesic', Price: '5', 'Cost Price': '3', Barcode: '5550001' },
      { Name: '', Category: 'Analgesic', Price: '5' },
      { Name: `Imp2 ${uid()}`, Category: 'Analgesic', Price: 'abc' },
      { Name: existing.name, Category: 'Analgesic', Price: '5' },
    ];
    const dry = await request(app).post('/api/import/medicines').set(auth(O.token)).send({ rows, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.summary).toEqual({ total: 4, valid: 1, errors: 2, skipped: 1 });
    expect(dry.body.results[1].errors[0]).toMatch(/Name is required/);

    const commitBad = await request(app).post('/api/import/medicines').set(auth(O.token)).send({ rows, dryRun: false });
    expect(commitBad.status).toBe(400);
    expect(await Medicine.countDocuments({ pharmacyId: O.pharmacy._id, barcode: '5550001' })).toBe(0);

    const commit = await request(app).post('/api/import/medicines').set(auth(O.token))
      .send({ rows: [rows[0], rows[3]], dryRun: false });
    expect(commit.status).toBe(200);
    expect(commit.body.committed).toBe(1);
    expect(await Medicine.countDocuments({ pharmacyId: O.pharmacy._id, barcode: '5550001' })).toBe(1);

    const cashier = await request(app).post('/api/import/medicines').set(auth(cashierToken)).send({ rows });
    expect(cashier.status).toBe(403);
  });

  test('opening stock import validates and creates batches with movements', async () => {
    const m = await createMedicine(O.pharmacy._id, { barcode: `77${Date.now()}` });
    const rows = [
      { Barcode: m.barcode, 'Batch No': 'OPEN-1', Quantity: '40', 'Expiry Date': daysFromNow(400).toISOString().slice(0, 10), 'Purchase Price': '2.5' },
      { Medicine: 'Does not exist', 'Batch No': 'X', Quantity: '1', 'Expiry Date': '2099-01-01' },
      { Medicine: m.name, 'Batch No': 'OPEN-2', Quantity: '-1', 'Expiry Date': '01/01/2001' },
    ];
    const dry = await request(app).post('/api/import/opening-stock').set(auth(O.token)).send({ rows });
    expect(dry.status).toBe(200);
    expect(dry.body.dryRun).toBe(true);
    expect(dry.body.summary.errors).toBe(2);
    expect(dry.body.results[2].errors.length).toBe(2);

    const commit = await request(app).post('/api/import/opening-stock').set(auth(O.token))
      .send({ rows: [rows[0]], dryRun: false });
    expect(commit.status).toBe(200);
    expect(commit.body.committed).toBe(1);
    const batch = await StockBatch.findOne({ pharmacyId: O.pharmacy._id, medicineId: m._id, batchNo: 'OPEN-1' });
    expect(batch.quantity).toBe(40);
    expect(await StockMovement.countDocuments({ batchId: batch._id, type: 'stock_in' })).toBe(1);

    const repeat = await request(app).post('/api/import/opening-stock').set(auth(O.token))
      .send({ rows: [rows[0]], dryRun: false });
    expect(repeat.status).toBe(400);
  });
});
