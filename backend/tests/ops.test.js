// Operations & reliability: health endpoints, Sentry scrubbing, backup rotation,
// clone / verify-restore safety checks and the demo seeder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');

const { app, request, connectTestDb, disconnectTestDb, createPharmacist, createMedicine } = require('./helpers');
const pkg = require('../package.json');
const AppError = require('../utils/AppError');
const { shouldReport, scrubEvent, beforeSend, isConfigured } = require('../instrument');
const { exportDatabase } = require('../scripts/backupLib');
const {
  parseCliArgs,
  assertValidDbName,
  assertCloneArgs,
  assertCloneTargetWritable,
  assertScratchTarget,
  cloneDatabase,
  verifyRestore,
  latestBackupDir,
  sampleOf,
} = require('../scripts/opsLib');
const { rotateBackups, listBackups, parseBackupDate, retentionDays } = require('../jobs/backupJob');
const { seedPharmacyData, assertSeedAllowed } = require('../utils/seedPharmacyData');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const Sale = require('../models/Sale');
const PurchaseOrder = require('../models/PurchaseOrder');
const Counter = require('../models/Counter');

let tmp;

beforeAll(async () => {
  await connectTestDb('ops');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-ops-'));
});

afterAll(async () => {
  await disconnectTestDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const client = () => mongoose.connection.getClient();
const dbName = () => mongoose.connection.db.databaseName;

// ------------------------------------------------------------------ health

describe('health endpoints', () => {
  afterEach(() => {
    delete process.env.RENDER_GIT_COMMIT;
    jest.restoreAllMocks();
  });

  test('GET /api/health is unauthenticated and reports version + commit', async () => {
    process.env.RENDER_GIT_COMMIT = 'abc1234';
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, db: 'up', version: pkg.version, commit: 'abc1234' });
    expect(typeof res.body.uptime).toBe('number');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('commit is null when no commit env is set', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.commit).toBeNull();
  });

  test('GET /api/health stays 200 when the database is down (liveness only)', async () => {
    // readyState is a non-configurable getter backed by _readyState.
    const conn = mongoose.connection;
    const saved = conn._readyState;
    let res;
    try {
      conn._readyState = 0;
      res = await request(app).get('/api/health');
    } finally {
      conn._readyState = saved;
    }
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: 'ok', db: 'down' });
  });

  test('JSON responses are compressed when large enough, exports are not', async () => {
    const compression = require('compression');
    const filter = jest.spyOn(compression, 'filter');
    const res = await request(app).get('/api/health').set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    // Small bodies (< 1 kB) are sent as-is; the middleware is mounted and consulted.
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(filter).toHaveBeenCalled();
    filter.mockClear();
    await request(app).get('/api/export/whatever').set('Accept-Encoding', 'gzip');
    expect(filter).not.toHaveBeenCalled();
  });

  test('GET /api/health/ready pings the database', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, db: 'up', version: pkg.version });
    expect(typeof res.body.dbLatencyMs).toBe('number');
  });

  test('GET /api/health/ready returns 503 when the ping fails', async () => {
    const db = mongoose.connection.db;
    jest.spyOn(db, 'admin').mockReturnValue({ command: () => Promise.reject(new Error('boom')) });
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, db: 'down', reason: 'unreachable' });
    expect(JSON.stringify(res.body)).not.toContain('boom');
  });
});

// ------------------------------------------------------------------ sentry

describe('sentry helpers', () => {
  test('disabled in tests and without a DSN', () => {
    expect(isConfigured({ NODE_ENV: 'production' })).toBe(false);
    expect(isConfigured({ NODE_ENV: 'test', SENTRY_DSN: 'https://k@o.ingest.sentry.io/1' })).toBe(false);
    expect(isConfigured({ NODE_ENV: 'production', SENTRY_DSN: 'https://k@o.ingest.sentry.io/1' })).toBe(true);
  });

  test('only 5xx / unexpected errors are reported', () => {
    expect(shouldReport(new AppError('Not found', 404))).toBe(false);
    expect(shouldReport(new AppError('Bad', 400))).toBe(false);
    expect(shouldReport(Object.assign(new Error('dup'), { code: 11000 }))).toBe(false);
    expect(shouldReport(Object.assign(new Error('v'), { name: 'ValidationError', errors: { a: { message: 'x' } } }))).toBe(false);
    expect(shouldReport(new Error('kaboom'))).toBe(true);
    expect(shouldReport(new AppError('Upstream failed', 502))).toBe(true);
    expect(beforeSend({ message: 'x' }, { originalException: new AppError('nope', 403) })).toBeNull();
  });

  test('scrubEvent removes bodies, cookies, auth headers, query strings and PII', () => {
    const event = scrubEvent({
      request: {
        url: 'https://api.example.com/api/auth/login?token=secret',
        data: { email: 'a@b.c', password: 'hunter2' },
        cookies: { refresh: 'x' },
        query_string: 'token=secret',
        headers: { Authorization: 'Bearer abc', cookie: 'a=b', 'user-agent': 'jest', 'x-pharmacy-id': '123' },
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
      extra: { nested: { password: 'p', ok: 1 }, apiKey: 'k' },
    });
    expect(event.request.data).toBeUndefined();
    expect(event.request.cookies).toBeUndefined();
    expect(event.request.query_string).toBeUndefined();
    expect(event.request.url).toBe('https://api.example.com/api/auth/login');
    expect(event.request.headers).toEqual({ 'user-agent': 'jest', 'x-pharmacy-id': '123' });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.extra).toEqual({ nested: { password: '[redacted]', ok: 1 }, apiKey: '[redacted]' });
  });
});

// ------------------------------------------------------------------ guards

describe('clone / verify-restore safety checks', () => {
  test('parseCliArgs supports "--k v", "--k=v" and flags', () => {
    expect(parseCliArgs(['--from', 'a', '--to=b', '--force', '--drop'])).toEqual({ from: 'a', to: 'b', force: true, drop: true });
  });

  test('assertValidDbName rejects empty, invalid and system names', () => {
    expect(() => assertValidDbName('')).toThrow(/required/);
    expect(() => assertValidDbName('a.b')).toThrow(/Invalid/);
    expect(() => assertValidDbName('a/b')).toThrow(/Invalid/);
    expect(() => assertValidDbName('admin')).toThrow(/system/);
    expect(() => assertValidDbName('Local')).toThrow(/system/);
    expect(assertValidDbName('pharmacy-erp')).toBe('pharmacy-erp');
  });

  test('assertCloneArgs refuses --to equal to --from', () => {
    expect(() => assertCloneArgs({ from: 'prod', to: 'prod' })).toThrow(/same database/);
    expect(() => assertCloneArgs({ from: 'Prod', to: 'prod' })).toThrow(/same database/);
    expect(() => assertCloneArgs({ from: 'prod' })).toThrow(/--to/);
    expect(assertCloneArgs({ from: 'prod', to: 'prod_copy' })).toEqual({ from: 'prod', to: 'prod_copy' });
  });

  test('assertCloneTargetWritable refuses a non-empty target without --force', () => {
    expect(assertCloneTargetWritable({ to: 'x', targetCollections: [] })).toBe(true);
    expect(assertCloneTargetWritable({ to: 'x', targetCollections: ['system.views'] })).toBe(true);
    expect(() => assertCloneTargetWritable({ to: 'x', targetCollections: ['sales'] })).toThrow(/not empty/);
    expect(assertCloneTargetWritable({ to: 'x', targetCollections: ['sales'], force: true })).toBe(true);
  });

  test('assertScratchTarget requires a separate "restore"/"test" database', () => {
    expect(() => assertScratchTarget({ target: 'prod', source: 'prod' })).toThrow(/live database/);
    expect(() => assertScratchTarget({ target: 'prod_restore', source: 'x', backupSource: 'PROD_RESTORE' })).toThrow(/backup was taken/);
    expect(() => assertScratchTarget({ target: 'prod_copy', source: 'prod' })).toThrow(/restore" or "test/);
    expect(() => assertScratchTarget({ target: 'admin', source: 'prod' })).toThrow(/system/);
    expect(assertScratchTarget({ target: 'prod_restore_test', source: 'prod', backupSource: 'prod' })).toBe('prod_restore_test');
    expect(assertScratchTarget({ target: 'Test-copy', source: 'prod' })).toBe('Test-copy');
  });

  test('sampleOf spreads samples and includes both ends', () => {
    expect(sampleOf([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(sampleOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toEqual([1, 6, 10]);
  });
});

// ------------------------------------------------------------------ clone + verify (in-memory cluster)

describe('cloneDatabase and verifyRestore against an in-memory cluster', () => {
  let pharmacy;

  beforeAll(async () => {
    ({ pharmacy } = await createPharmacist({ login: false }));
    await createMedicine(pharmacy._id);
    await createMedicine(pharmacy._id);
    await mongoose.connection.db.createCollection('medicine_names', { viewOn: 'medicines', pipeline: [{ $project: { name: 1 } }] });
  });

  test('copies documents, indexes and views; refuses to overwrite without --force', async () => {
    const to = `${dbName()}_clone`;
    try {
      const report = await cloneDatabase({ client: client(), from: dbName(), to });
      expect(report.ok).toBe(true);
      expect(report.collections.medicines).toMatchObject({ source: 2, target: 2 });
      expect(report.views).toContain('medicine_names');
      const srcIdx = (await mongoose.connection.db.collection('medicines').indexes()).map((i) => i.name).sort();
      const dstIdx = (await client().db(to).collection('medicines').indexes()).map((i) => i.name).sort();
      expect(dstIdx).toEqual(srcIdx);

      await expect(cloneDatabase({ client: client(), from: dbName(), to })).rejects.toThrow(/not empty/);
      await createMedicine(pharmacy._id);
      const again = await cloneDatabase({ client: client(), from: dbName(), to, force: true });
      expect(again.collections.medicines).toMatchObject({ source: 3, target: 3 });
      await expect(cloneDatabase({ client: client(), from: dbName(), to: dbName() })).rejects.toThrow(/same database/);
    } finally {
      await client().db(to).dropDatabase();
    }
  });

  test('verifyRestore restores the latest backup into a scratch db and reports PASS', async () => {
    const outDir = path.join(tmp, 'verify');
    await exportDatabase({ db: mongoose.connection.db, outDir, gzip: true, now: new Date(2026, 0, 1) });
    const { dir: latest } = await exportDatabase({ db: mongoose.connection.db, outDir, gzip: true, now: new Date(2026, 0, 2) });
    expect(latestBackupDir(outDir)).toBe(latest);

    const target = `${dbName()}_restore_test`;
    await expect(verifyRestore({ client: client(), dir: latest, target: dbName(), source: dbName() })).rejects.toThrow(/live database/);
    await expect(verifyRestore({ client: client(), dir: latest, target: 'scratch_copy', source: dbName() })).rejects.toThrow(
      /restore" or "test/
    );

    const result = await verifyRestore({ client: client(), dir: latest, target, source: dbName(), sampleSize: 5 });
    expect(result.ok).toBe(true);
    expect(result.collections.medicines).toMatchObject({ expected: 3, restored: 3, ok: true });

    // Non-empty scratch db: refused without --force; --drop cleans up afterwards.
    await expect(verifyRestore({ client: client(), dir: latest, target, source: dbName() })).rejects.toThrow(/not empty/);
    const again = await verifyRestore({ client: client(), dir: latest, target, source: dbName(), force: true, drop: true });
    expect(again.ok).toBe(true);
    const left = await client().db(target).listCollections().toArray();
    expect(left).toHaveLength(0);
  });

  test('verifyRestore reports FAIL when the backup does not match what was restored', async () => {
    const outDir = path.join(tmp, 'verify-bad');
    const { dir } = await exportDatabase({ db: mongoose.connection.db, outDir });
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.collections.medicines.count += 1; // simulate a truncated file
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = await verifyRestore({ client: client(), dir, target: `${dbName()}_restore_bad`, source: dbName(), drop: true });
    expect(result.ok).toBe(false);
    expect(result.collections.medicines.ok).toBe(false);
  });
});

// ------------------------------------------------------------------ backup rotation

describe('backup job rotation', () => {
  const makeBackup = (dir, name) => {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'manifest.json'), '{}');
  };

  test('deletes full backups past retention, keeps the newest and unrelated folders', () => {
    const dir = path.join(tmp, 'rotate');
    makeBackup(dir, 'backup-20260101-020000');
    makeBackup(dir, 'backup-20260105-020000');
    makeBackup(dir, 'backup-20260110-020000');
    makeBackup(dir, 'backup-20260101-020000-pharmacy-abc'); // per-pharmacy: not touched
    fs.mkdirSync(path.join(dir, 'backup-20250101-020000')); // no manifest: not touched

    expect(listBackups(dir).map((b) => b.name)).toEqual([
      'backup-20260110-020000',
      'backup-20260105-020000',
      'backup-20260101-020000',
    ]);
    const deleted = rotateBackups(dir, 7, { now: new Date(2026, 0, 13) });
    expect(deleted).toEqual(['backup-20260105-020000', 'backup-20260101-020000']);
    expect(fs.readdirSync(dir).sort()).toEqual(['backup-20250101-020000', 'backup-20260101-020000-pharmacy-abc', 'backup-20260110-020000']);

    // The newest backup survives even when it is past retention.
    expect(rotateBackups(dir, 1, { now: new Date(2027, 0, 1) })).toEqual([]);
    expect(rotateBackups(dir, 0, { now: new Date(2030, 0, 1) })).toEqual([]);
  });

  test('parses folder dates and retention env', () => {
    expect(parseBackupDate('backup-20260102-030405')).toEqual(new Date(2026, 0, 2, 3, 4, 5));
    expect(parseBackupDate('backup-20260102-030405-2')).toEqual(new Date(2026, 0, 2, 3, 4, 5));
    expect(parseBackupDate('other')).toBeNull();
    expect(retentionDays({})).toBe(14);
    expect(retentionDays({ BACKUP_RETENTION_DAYS: '30' })).toBe(30);
    expect(retentionDays({ BACKUP_RETENTION_DAYS: '0' })).toBe(0);
    expect(retentionDays({ BACKUP_RETENTION_DAYS: 'abc' })).toBe(14);
  });
});

// ------------------------------------------------------------------ seeder

describe('demo data seeder', () => {
  test('refuses to run in production without --force', () => {
    expect(() => assertSeedAllowed({ env: { NODE_ENV: 'production' } })).toThrow(/production/);
    expect(assertSeedAllowed({ env: { NODE_ENV: 'production' }, force: true })).toBe(true);
    expect(assertSeedAllowed({ env: { NODE_ENV: 'development' } })).toBe(true);
  });

  test('sales reduce stock, record movements and use the invoice/PO sequences; idempotent', async () => {
    const { pharmacy, user } = await createPharmacist({ login: false });
    const pid = pharmacy._id;
    const first = await seedPharmacyData({ pharmacyId: pid });
    expect(first.sales).toBe(16);
    expect(first.purchaseOrders).toBe(4);
    expect(first.batches).toBeGreaterThan(0);

    const sales = await Sale.find({ pharmacyId: pid }).sort({ createdAt: 1 });
    expect(sales).toHaveLength(16);
    const year = new Date().getFullYear();
    for (const s of sales) {
      expect(s.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
      expect(String(s.staffId)).toBe(String(user._id));
      expect(s.amountPaid).toBe(s.grandTotal);
      expect(s.payments).toHaveLength(1);
      expect(s.payments[0].amount).toBe(s.grandTotal);
      for (const it of s.items) expect(it.costPrice).toBeGreaterThan(0);
    }
    expect(sales.some((s) => s.createdAt < new Date(Date.now() - 2 * 24 * 3600 * 1000))).toBe(true);
    const counter = await Counter.findOne({ pharmacyId: pid, name: 'invoice' });
    expect(counter.seq).toBe(16);
    expect(sales.map((s) => s.invoiceNumber).sort().pop()).toBe(`INV-${year}-000016`);
    const pos = await PurchaseOrder.find({ pharmacyId: pid });
    expect(pos.every((p) => /^PO-\d{4}-\d{6}$/.test(p.poNumber))).toBe(true);
    expect((await Counter.findOne({ pharmacyId: pid, name: 'po' })).seq).toBe(4);

    // Stock: initial - sold = current, per batch, and the ledger agrees.
    const batches = await StockBatch.find({ pharmacyId: pid });
    const sold = {};
    for (const s of sales) for (const it of s.items) sold[it.batchId] = (sold[it.batchId] || 0) + it.quantity;
    let totalSold = 0;
    for (const b of batches) {
      expect(b.quantity).toBe(b.initialQuantity - (sold[b._id] || 0));
      totalSold += sold[b._id] || 0;
      const net = await StockMovement.aggregate([
        { $match: { batchId: b._id } },
        { $group: { _id: null, sum: { $sum: '$quantityChange' } } },
      ]);
      expect(net[0].sum).toBe(b.quantity);
    }
    expect(totalSold).toBeGreaterThan(0);
    const saleMovements = await StockMovement.countDocuments({ pharmacyId: pid, type: 'sale', refModel: 'Sale' });
    expect(saleMovements).toBe(sales.reduce((n, s) => n + s.items.length, 0));

    const again = await seedPharmacyData({ pharmacyId: pid });
    expect(again).toMatchObject({ batches: 0, purchaseOrders: 0, sales: 0 });
    expect(await Sale.countDocuments({ pharmacyId: pid })).toBe(16);
  });
});
