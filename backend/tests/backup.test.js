const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');

const { connectTestDb, disconnectTestDb, createPharmacist, createMedicine } = require('./helpers');
const { exportDatabase, restoreDatabase, readManifest } = require('../scripts/backupLib');
const Medicine = require('../models/Medicine');

const { EJSON } = mongoose.mongo.BSON;

let tmp;
let a;
let b;
let medA;

beforeAll(async () => {
  await connectTestDb('backup');
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-backup-'));
  a = await createPharmacist({ login: false });
  b = await createPharmacist({ login: false });
  medA = await createMedicine(a.pharmacy._id, { price: 12.5 });
  await createMedicine(a.pharmacy._id);
  await createMedicine(b.pharmacy._id);
});

afterAll(async () => {
  await disconnectTestDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const db = () => mongoose.connection.db;

test('full backup exports every collection as EJSON with a manifest', async () => {
  const { dir, manifest } = await exportDatabase({ db: db(), outDir: tmp, now: new Date(2026, 0, 2, 3, 4, 5) });
  expect(path.basename(dir)).toBe('backup-20260102-030405');
  expect(manifest.scope).toEqual({ type: 'all' });
  expect(manifest.collections.medicines.count).toBe(3);
  expect(manifest.collections.pharmacies.count).toBe(2);
  expect(manifest.collections.users.count).toBe(2);

  const docs = EJSON.parse(fs.readFileSync(path.join(dir, 'medicines.json'), 'utf8'), { relaxed: false });
  const saved = docs.find((d) => String(d._id) === String(medA._id));
  // Types survive the round trip (ObjectId / Date), not just strings
  expect(saved._id).toBeInstanceOf(mongoose.mongo.ObjectId);
  expect(saved.pharmacyId).toBeInstanceOf(mongoose.mongo.ObjectId);
  expect(saved.createdAt).toBeInstanceOf(Date);
  expect(readManifest(dir).database).toBe(db().databaseName);
});

test('per-pharmacy backup only contains that pharmacy (gzip)', async () => {
  const { dir, manifest } = await exportDatabase({
    db: db(),
    outDir: tmp,
    pharmacyId: String(a.pharmacy._id),
    gzip: true,
  });
  expect(manifest.scope).toEqual({ type: 'pharmacy', pharmacyId: String(a.pharmacy._id) });
  expect(manifest.collections.medicines).toMatchObject({ file: 'medicines.json.gz', count: 2 });
  expect(manifest.collections.pharmacies.count).toBe(1);
  expect(manifest.collections.users.count).toBe(1);

  const users = EJSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'users.json.gz'))).toString('utf8'));
  expect(users.map((u) => u.email)).toEqual([a.email]);
});

test('rejects an invalid or unknown pharmacy id', async () => {
  await expect(exportDatabase({ db: db(), outDir: tmp, pharmacyId: 'nope' })).rejects.toThrow(/Invalid pharmacy id/);
  await expect(
    exportDatabase({ db: db(), outDir: tmp, pharmacyId: String(new mongoose.Types.ObjectId()) })
  ).rejects.toThrow(/not found/);
});

test('restore: dry run writes nothing, upsert and replace restore the pharmacy data', async () => {
  const { dir } = await exportDatabase({ db: db(), outDir: tmp, pharmacyId: String(a.pharmacy._id) });

  // Simulate damage: one medicine edited, one deleted, plus a new one created after the backup
  await Medicine.updateOne({ _id: medA._id }, { $set: { price: 99 } });
  const other = await Medicine.findOne({ pharmacyId: a.pharmacy._id, _id: { $ne: medA._id } });
  await Medicine.deleteOne({ _id: other._id });
  const extra = await createMedicine(a.pharmacy._id);

  const dry = await restoreDatabase({ db: db(), dir, dryRun: true, collections: ['medicines'] });
  expect(dry.collections.medicines).toMatchObject({ inBackup: 2, existing: 1, written: 0 });
  expect((await Medicine.findById(medA._id)).price).toBe(99);

  await restoreDatabase({ db: db(), dir, collections: ['medicines'] });
  expect((await Medicine.findById(medA._id)).price).toBe(12.5);
  expect(await Medicine.exists({ _id: other._id })).toBeTruthy();
  expect(await Medicine.exists({ _id: extra._id })).toBeTruthy(); // upsert never deletes

  const replaced = await restoreDatabase({ db: db(), dir, mode: 'replace', collections: ['medicines'] });
  expect(replaced.collections.medicines.deleted).toBe(3);
  expect(await Medicine.exists({ _id: extra._id })).toBeFalsy();
  expect(await Medicine.countDocuments({ pharmacyId: a.pharmacy._id })).toBe(2);
  // Other pharmacies are untouched by a pharmacy-scoped replace
  expect(await Medicine.countDocuments({ pharmacyId: b.pharmacy._id })).toBe(1);
});
