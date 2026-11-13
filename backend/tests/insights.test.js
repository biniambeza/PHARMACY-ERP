const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const Sale = require('../models/Sale');
const StockMovement = require('../models/StockMovement');
const AuditLog = require('../models/AuditLog');
const { computeTax } = require('../services/tax');

let Return = null;
try {
  Return = require('../models/Return');
} catch {
  Return = null;
}

const DAY = 24 * 60 * 60 * 1000;

// Creates a staff member with a membership in `pharmacyId` and logs them in.
const createStaff = async (pharmacyId, role) => {
  const email = `${role}_${uid()}@example.com`;
  await User.create({
    name: `${role} ${uid()}`, email, password: PASSWORD, role: 'pharmacist',
    memberships: [{ pharmacyId, role, active: true }],
  });
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (!res.body.token) throw new Error(`login failed ${res.status}`);
  return res.body.token;
};

// Inserts a sale directly (bypassing the POS) with an explicit createdAt.
let invoiceSeq = 0;
const insertSale = async (pharmacyId, userId, { items, createdAt = new Date(), ...rest }) => {
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const sale = new Sale({
    pharmacyId,
    pharmacistId: userId,
    staffId: userId,
    invoiceNumber: `INV-T-${++invoiceSeq}-${uid()}`,
    items: items.map((i) => ({ batchNo: 'B', name: i.name || 'Item', unitPrice: i.subtotal / i.quantity, ...i })),
    subtotal,
    grandTotal: subtotal,
    ...rest,
  });
  const doc = sale.toObject();
  doc.createdAt = createdAt;
  doc.updatedAt = createdAt;
  await Sale.collection.insertOne(doc);
  return doc;
};

const get = (token, url) => request(app).get(url).set(auth(token));

beforeAll(async () => {
  await connectTestDb('insights');
});

afterAll(disconnectTestDb);

// ---------------------------------------------------------------------------
describe('services/tax computeTax', () => {
  const pharmacy = (tax) => ({ settings: { tax: { enabled: true, name: 'VAT', rate: 15, inclusive: false, ...tax } } });

  test('exclusive: tax = lineTotal * rate', () => {
    const r = computeTax({ pharmacy: pharmacy({}), lines: [{ medicine: {}, lineTotal: 100 }, { medicine: {}, lineTotal: 33.33 }] });
    expect(r.lineTaxes).toEqual([15, 5]);
    expect(r.taxTotal).toBe(20);
    expect(r.taxLines).toEqual([{ name: 'VAT', rate: 15, amount: 20 }]);
  });

  test('inclusive: tax = lineTotal - lineTotal / (1 + rate)', () => {
    const r = computeTax({ pharmacy: pharmacy({ inclusive: true }), lines: [{ medicine: {}, lineTotal: 115 }, { medicine: null, lineTotal: 10 }] });
    expect(r.lineTaxes).toEqual([15, 1.3]);
    expect(r.taxTotal).toBe(16.3);
  });

  test('tax-exempt medicines pay no tax', () => {
    const r = computeTax({
      pharmacy: pharmacy({}),
      lines: [{ medicine: { taxExempt: true }, lineTotal: 100 }, { medicine: { taxExempt: false }, lineTotal: 10 }],
    });
    expect(r.lineTaxes).toEqual([0, 1.5]);
    expect(r.taxTotal).toBe(1.5);
  });

  test('disabled tax returns zeros and no tax lines', () => {
    const r = computeTax({ pharmacy: pharmacy({ enabled: false }), lines: [{ medicine: {}, lineTotal: 100 }] });
    expect(r).toEqual({ taxLines: [], taxTotal: 0, lineTaxes: [0] });
    expect(computeTax({ pharmacy: null, lines: [] })).toEqual({ taxLines: [], taxTotal: 0, lineTaxes: [] });
  });
});

// ---------------------------------------------------------------------------
describe('Financial analytics', () => {
  let O;
  let med;
  let batch;

  beforeAll(async () => {
    O = await createPharmacist();
    med = await createMedicine(O.pharmacy._id, { price: 10, costPrice: 3 });
    batch = await insertBatchRaw(O.pharmacy._id, med._id, { quantity: 100, expiryDate: daysFromNow(200) }); // purchasePrice 5

    // Today: costPrice recorded on the item (4) -> COGS 8
    await insertSale(O.pharmacy._id, O.user._id, {
      items: [{ medicineId: med._id, batchId: batch._id, quantity: 2, subtotal: 20, costPrice: 4 }],
      paymentMethod: 'cash',
    });
    // Today: no item costPrice -> batch purchasePrice 5 -> COGS 5; credit sale
    await insertSale(O.pharmacy._id, O.user._id, {
      items: [{ medicineId: med._id, batchId: batch._id, quantity: 1, subtotal: 10 }],
      paymentMethod: 'credit',
      balanceDue: 10,
      amountPaid: 0,
    });
    // Today: batch missing -> medicine costPrice 3 -> COGS 9; split payment cash 10 + card 20
    await insertSale(O.pharmacy._id, O.user._id, {
      items: [{ medicineId: med._id, batchId: new mongoose.Types.ObjectId(), quantity: 3, subtotal: 30 }],
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 10 }, { method: 'card', amount: 20 }],
    });
    // Today, voided: must be ignored
    await insertSale(O.pharmacy._id, O.user._id, {
      items: [{ medicineId: med._id, batchId: batch._id, quantity: 5, subtotal: 50, costPrice: 4 }],
      voided: true,
    });
    // 60 days ago: outside 7d and monthly
    await insertSale(O.pharmacy._id, O.user._id, {
      items: [{ medicineId: med._id, batchId: batch._id, quantity: 10, subtotal: 100, costPrice: 4 }],
      createdAt: new Date(Date.now() - 60 * DAY),
    });
  });

  test('7d range: revenue/COGS only for the period, voided excluded, credit included', async () => {
    const res = await get(O.token, '/api/reports/analytics?range=7d');
    expect(res.status).toBe(200);
    const { financials, paymentMethods } = res.body.analytics;
    expect(financials.totalRevenue).toBe(60);
    expect(financials.totalOrders).toBe(3);
    expect(financials.totalCOGS).toBe(22); // 8 + 5 + 9
    expect(financials.grossProfit).toBe(38);
    expect(paymentMethods.credit).toEqual({ count: 1, total: 10 });
    expect(paymentMethods.cash.total).toBe(30); // 20 + split 10
    expect(paymentMethods.card.total).toBe(20);
    expect(res.body.analytics.topMedicines[0].estimatedProfit).toBe(38);
  });

  test('custom range covers only the old sale; all includes everything', async () => {
    const day = (ms) => new Date(Date.now() - ms).toISOString().slice(0, 10);
    const custom = await get(O.token, `/api/reports/analytics?range=custom&from=${day(65 * DAY)}&to=${day(55 * DAY)}`);
    expect(custom.status).toBe(200);
    expect(custom.body.analytics.financials.totalRevenue).toBe(100);
    expect(custom.body.analytics.financials.totalCOGS).toBe(40);

    const all = await get(O.token, '/api/reports/analytics?range=all');
    expect(all.body.analytics.financials.totalRevenue).toBe(160);
  });

  test('invalid custom range is rejected', async () => {
    const res = await get(O.token, '/api/reports/analytics?range=custom&from=2026-02-30&to=2026-03-01');
    expect(res.status).toBe(400);
    const bad = await get(O.token, '/api/reports/analytics?range=bogus');
    expect(bad.status).toBe(400);
  });

  test('dashboard overview: all-time KPIs and period KPIs use actual COGS', async () => {
    const res = await get(O.token, '/api/reports/overview?range=7d');
    expect(res.status).toBe(200);
    const { kpis } = res.body.overview;
    expect(kpis.totalRevenue).toBe(160);
    expect(kpis.totalOrders).toBe(4);
    expect(kpis.totalCOGS).toBe(62);
    expect(kpis.netProfit).toBe(98);
    expect(kpis.period.revenue).toBe(60);
    expect(kpis.period.cogs).toBe(22);
  });

  (Return ? test : test.skip)('returns are subtracted from revenue and restocked cost from COGS', async () => {
    const P = await createPharmacist();
    const m = await createMedicine(P.pharmacy._id, { costPrice: 2 });
    const b = await insertBatchRaw(P.pharmacy._id, m._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const sale = await insertSale(P.pharmacy._id, P.user._id, {
      items: [{ medicineId: m._id, batchId: b._id, quantity: 4, subtotal: 40, costPrice: 5 }],
    });
    await Return.create({
      pharmacyId: P.pharmacy._id,
      saleId: sale._id,
      returnNumber: `RET-${uid()}`,
      items: [{
        saleItemId: sale.items[0]._id, medicineId: m._id, name: 'x', batchId: b._id,
        quantity: 1, unitPrice: 10, refundAmount: 10, restocked: true,
      }],
      reason: 'test',
      refundTotal: 10,
      processedBy: P.user._id,
    });
    const res = await get(P.token, '/api/reports/analytics?range=7d');
    expect(res.body.analytics.financials.totalRevenue).toBe(30);
    expect(res.body.analytics.financials.refunds).toBe(10);
    expect(res.body.analytics.financials.totalCOGS).toBe(15);
  });

  test('additional reports respond with data', async () => {
    const profit = await get(O.token, '/api/reports/profit?range=7d&groupBy=category');
    expect(profit.status).toBe(200);
    expect(profit.body.report.rows[0].category).toBe('Analgesic');
    expect(profit.body.report.totals.profit).toBe(38);

    const staff = await get(O.token, '/api/reports/sales-by-staff?range=7d');
    expect(staff.status).toBe(200);
    expect(staff.body.report.rows[0].orders).toBe(3);

    const shift = await get(O.token, '/api/reports/sales-by-shift?range=7d');
    expect(shift.status).toBe(200);
    expect(shift.body.report.rows[0].label).toBe('No shift');

    const cmp = await get(O.token, '/api/reports/comparison?range=7d');
    expect(cmp.status).toBe(200);
    expect(cmp.body.report.current.revenue).toBe(60);
    expect(cmp.body.report.previous.revenue).toBe(0);
  });

  test('tax summary reads sale.taxLines', async () => {
    const P = await createPharmacist();
    const m = await createMedicine(P.pharmacy._id);
    await insertSale(P.pharmacy._id, P.user._id, {
      items: [{ medicineId: m._id, batchId: new mongoose.Types.ObjectId(), quantity: 1, subtotal: 100 }],
      tax: 15, grandTotal: 115, taxLines: [{ name: 'VAT', rate: 15, amount: 15 }],
    });
    const res = await get(P.token, '/api/reports/tax-summary?range=7d');
    expect(res.status).toBe(200);
    expect(res.body.report.totals.tax).toBe(15);
    expect(res.body.report.byRate).toEqual([{ name: 'VAT', rate: 15, amount: 15, sales: 1 }]);
  });

  test('slow-moving and expiry-loss reports', async () => {
    const P = await createPharmacist();
    const dead = await createMedicine(P.pharmacy._id, { name: 'Dead med' });
    const db = await insertBatchRaw(P.pharmacy._id, dead._id, { quantity: 10, expiryDate: daysFromNow(300) });
    await StockMovement.create({
      pharmacyId: P.pharmacy._id, batchId: db._id, medicineId: dead._id, type: 'expire', quantityChange: -4, balanceAfter: 6,
    });

    const slow = await get(P.token, '/api/reports/slow-moving?days=30');
    expect(slow.status).toBe(200);
    expect(slow.body.report.rows[0]).toMatchObject({ name: 'Dead med', status: 'dead', quantity: 10, stockValue: 50 });

    const loss = await get(P.token, '/api/reports/expiry-loss?range=yearly');
    expect(loss.status).toBe(200);
    expect(loss.body.report.totals.value).toBe(20);
    expect(loss.body.report.totals.units).toBe(4);
  });

  test('cashier cannot view reports', async () => {
    const cashier = await createStaff(O.pharmacy._id, 'cashier');
    expect((await get(cashier, '/api/reports/analytics')).status).toBe(403);
    expect((await get(cashier, '/api/reports/profit')).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('Pharmacy settings', () => {
  let O;
  beforeAll(async () => {
    O = await createPharmacist();
  });

  test('owner updates tax settings; change is audited', async () => {
    const res = await request(app).put('/api/pharmacy/my-pharmacy').set(auth(O.token)).send({
      settings: {
        tax: { enabled: true, rate: 15, inclusive: true, registrationNo: 'TIN-123' },
        currency: 'usd',
        receiptWidth: '58mm',
        expiryAlertDays: [30, 90, 30],
        notify: { email: true },
        maxDiscountPercent: 20,
        receiptFooter: 'Thanks!',
      },
    });
    expect(res.status).toBe(200);
    const saved = await Pharmacy.findById(O.pharmacy._id).lean();
    expect(saved.settings.tax).toMatchObject({ enabled: true, rate: 15, inclusive: true, registrationNo: 'TIN-123', name: 'VAT' });
    expect(saved.settings.currency).toBe('USD');
    expect(saved.settings.receiptWidth).toBe('58mm');
    expect(saved.settings.expiryAlertDays).toEqual([90, 30]);
    expect(saved.settings.notify).toMatchObject({ email: true, sms: false });
    expect(saved.settings.maxDiscountPercent).toBe(20);

    const log = await AuditLog.findOne({ pharmacyId: O.pharmacy._id, action: 'pharmacy.settings_update' }).lean();
    expect(log).toBeTruthy();
    expect(log.before.settings.tax.enabled).toBe(false);
    expect(log.after.settings.tax.enabled).toBe(true);
  });

  test('invalid settings are rejected', async () => {
    const bad = await request(app).put('/api/pharmacy/my-pharmacy').set(auth(O.token)).send({ settings: { tax: { rate: 150 } } });
    expect(bad.status).toBe(400);
    const badWidth = await request(app).put('/api/pharmacy/my-pharmacy').set(auth(O.token)).send({ settings: { receiptWidth: '99mm' } });
    expect(badWidth.status).toBe(400);
  });

  test('non-owners cannot change settings but can read them', async () => {
    const pharmacist = await createStaff(O.pharmacy._id, 'pharmacist');
    const res = await request(app).put('/api/pharmacy/my-pharmacy').set(auth(pharmacist)).send({ settings: { currency: 'EUR' } });
    expect(res.status).toBe(403);

    const cashier = await createStaff(O.pharmacy._id, 'cashier');
    const read = await get(cashier, '/api/pharmacy/my-pharmacy');
    expect(read.status).toBe(200);
    expect(read.body.pharmacy.settings.tax.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Audit log API', () => {
  let O;
  beforeAll(async () => {
    O = await createPharmacist();
    await request(app).put('/api/pharmacy/my-pharmacy').set(auth(O.token)).send({ phone: '0911222333' });
  });

  test('owner lists, filters and paginates audit entries', async () => {
    const res = await get(O.token, '/api/audit?action=pharmacy.*&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);
    expect(res.body.logs.every((l) => l.action.startsWith('pharmacy.'))).toBe(true);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 5 });

    const one = await get(O.token, `/api/audit/${res.body.logs[0]._id}`);
    expect(one.status).toBe(200);

    const facets = await get(O.token, '/api/audit/facets');
    expect(facets.status).toBe(200);
    expect(facets.body.actions).toContain('pharmacy.update');

    const bad = await get(O.token, '/api/audit?userId=nope');
    expect(bad.status).toBe(400);
  });

  test('cashier and pharmacist get 403', async () => {
    const cashier = await createStaff(O.pharmacy._id, 'cashier');
    expect((await get(cashier, '/api/audit')).status).toBe(403);
    const pharmacist = await createStaff(O.pharmacy._id, 'pharmacist');
    expect((await get(pharmacist, '/api/audit')).status).toBe(403);
  });

  test('entries of another pharmacy are not visible', async () => {
    const other = await createPharmacist();
    const res = await get(other.token, '/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.logs.every((l) => String(l.pharmacyId) === String(other.pharmacy._id))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Export API', () => {
  let O;
  beforeAll(async () => {
    O = await createPharmacist();
    const m = await createMedicine(O.pharmacy._id, { name: '=HYPERLINK("x")' });
    await insertSale(O.pharmacy._id, O.user._id, {
      items: [{ medicineId: m._id, batchId: new mongoose.Types.ObjectId(), quantity: 1, subtotal: 10 }],
    });
  });

  const binary = (req) => req.buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  test('medicines and sales export as xlsx', async () => {
    for (const entity of ['medicines', 'sales', 'stock', 'purchase-orders']) {
      const res = await binary(get(O.token, `/api/export/${entity}?format=xlsx`));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toContain(`${entity}-`);
      expect(res.body.slice(0, 2).toString()).toBe('PK'); // zip container
    }
  });

  test('csv export neutralizes formulas', async () => {
    const res = await get(O.token, '/api/export/medicines?format=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  test('unknown entity 404, cashier 403', async () => {
    expect((await get(O.token, '/api/export/nothing')).status).toBe(404);
    const cashier = await createStaff(O.pharmacy._id, 'cashier');
    expect((await get(cashier, '/api/export/sales')).status).toBe(403);
  });
});
