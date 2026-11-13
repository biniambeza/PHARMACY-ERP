// Shared logic for scripts/backup.js and scripts/restore.js (#28).
//
// A backup is a folder containing:
//   manifest.json                 { version, createdAt, database, scope, gzip, collections: { name: { file, count } } }
//   <collection>.json[.gz]        Canonical Extended JSON (EJSON) array of every exported document
//
// Works on a native MongoDB `Db` (e.g. mongoose.connection.db), so it does not depend on
// the Mongoose models and also covers collections without a model.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { once } = require('events');
const { pipeline } = require('stream/promises');
const mongoose = require('mongoose');

const { EJSON, ObjectId } = mongoose.mongo.BSON;

const BACKUP_VERSION = 1;

// Collections that are global (not owned by one pharmacy) and are skipped in a
// per-pharmacy backup. Short-lived tokens are never worth restoring per pharmacy.
const GLOBAL_ONLY = new Set(['announcements', 'passwordresettokens']);

const pad = (n) => String(n).padStart(2, '0');
const timestamp = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const toObjectId = (id) => {
  if (id instanceof ObjectId) return id;
  if (typeof id !== 'string' || !ObjectId.isValid(id) || String(new ObjectId(id)) !== id.toLowerCase()) {
    throw new Error(`Invalid pharmacy id: ${id}`);
  }
  return new ObjectId(id);
};

/**
 * Per-collection filters for a single-pharmacy backup.
 * Returns { [collectionName]: filter | null } (null = skip the collection).
 */
async function pharmacyFilters(db, pharmacyId, collectionNames) {
  const pid = toObjectId(pharmacyId);
  const pharmacy = await db.collection('pharmacies').findOne({ _id: pid });
  if (!pharmacy) throw new Error(`Pharmacy ${pid} not found`);

  const filters = {};
  for (const name of collectionNames) {
    if (GLOBAL_ONLY.has(name)) {
      filters[name] = null;
    } else if (name === 'pharmacies') {
      filters[name] = { _id: pid };
    } else if (name === 'users') {
      const or = [{ 'memberships.pharmacyId': pid }];
      if (pharmacy.owner) or.push({ _id: pharmacy.owner });
      filters[name] = { $or: or };
    } else if (name === 'organizations') {
      filters[name] = pharmacy.organizationId ? { _id: pharmacy.organizationId } : null;
    } else if (name === 'transfers') {
      filters[name] = { $or: [{ fromPharmacyId: pid }, { toPharmacyId: pid }] };
    } else {
      // Every tenant collection carries pharmacyId; others simply export nothing.
      filters[name] = { pharmacyId: pid };
    }
  }
  return filters;
}

async function listCollectionNames(db) {
  const infos = await db.listCollections({}, { nameOnly: true }).toArray();
  return infos
    .filter((c) => (c.type || 'collection') === 'collection' && !c.name.startsWith('system.'))
    .map((c) => c.name)
    .sort();
}

// Write one collection as a streamed EJSON array (optionally gzipped). Returns doc count.
async function writeCollection(cursor, filePath, gzip) {
  const file = fs.createWriteStream(filePath);
  const out = gzip ? zlib.createGzip() : file;
  const done = gzip ? pipeline(out, file) : null;

  const write = async (chunk) => {
    if (!out.write(chunk)) await once(out, 'drain');
  };

  let count = 0;
  await write('[\n');
  for await (const doc of cursor) {
    await write(`${count ? ',\n' : ''}${EJSON.stringify(doc, { relaxed: false })}`);
    count += 1;
  }
  await write('\n]\n');
  out.end();
  if (done) await done;
  else await once(file, 'finish');
  return count;
}

/**
 * Export every collection (or one pharmacy's data) to a timestamped folder.
 * @param {object} opts
 * @param {import('mongodb').Db} opts.db
 * @param {string} [opts.outDir]      parent folder (default backend/backups)
 * @param {string} [opts.pharmacyId]  limit to one pharmacy
 * @param {boolean} [opts.gzip]
 * @param {Date} [opts.now]
 * @returns {Promise<{ dir: string, manifest: object }>}
 */
async function exportDatabase({ db, outDir, pharmacyId, gzip = false, now = new Date(), log = () => {} }) {
  if (!db) throw new Error('exportDatabase: db is required');
  const parent = path.resolve(outDir || path.join(__dirname, '..', 'backups'));
  const suffix = pharmacyId ? `-pharmacy-${pharmacyId}` : '';
  let dir = path.join(parent, `backup-${timestamp(now)}${suffix}`);
  for (let i = 1; fs.existsSync(dir); i += 1) dir = path.join(parent, `backup-${timestamp(now)}${suffix}-${i}`);
  fs.mkdirSync(dir, { recursive: true });

  const names = await listCollectionNames(db);
  const filters = pharmacyId ? await pharmacyFilters(db, pharmacyId, names) : null;

  const manifest = {
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    database: db.databaseName,
    scope: pharmacyId ? { type: 'pharmacy', pharmacyId: String(pharmacyId) } : { type: 'all' },
    gzip: !!gzip,
    collections: {},
  };

  for (const name of names) {
    const filter = filters ? filters[name] : {};
    if (filter === null) continue;
    const file = `${name}.json${gzip ? '.gz' : ''}`;
    const cursor = db.collection(name).find(filter).sort({ _id: 1 });
    const count = await writeCollection(cursor, path.join(dir, file), gzip);
    manifest.collections[name] = { file, count, filter: EJSON.serialize(filter, { relaxed: false }) };
    log(`  ${name}: ${count}`);
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir, manifest };
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) throw new Error(`No manifest.json in ${dir}`);
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version ${manifest.version}`);
  return manifest;
}

function readCollectionFile(dir, file) {
  let buf = fs.readFileSync(path.join(dir, file));
  if (file.endsWith('.gz')) buf = zlib.gunzipSync(buf);
  const docs = EJSON.parse(buf.toString('utf8'), { relaxed: false });
  if (!Array.isArray(docs)) throw new Error(`${file} is not an array`);
  return docs;
}

/**
 * Restore a backup folder.
 * mode 'upsert'  (default): replace documents by _id, insert missing ones; nothing is deleted.
 * mode 'replace': first delete every document in the backup's scope (whole collection for an
 *                 'all' backup, the pharmacy's documents for a pharmacy backup), then insert.
 * dryRun: only report what would happen.
 */
async function restoreDatabase({ db, dir, mode = 'upsert', dryRun = false, collections, log = () => {} }) {
  if (!db) throw new Error('restoreDatabase: db is required');
  if (!['upsert', 'replace'].includes(mode)) throw new Error(`Unknown mode ${mode}`);
  const manifest = readManifest(dir);
  const only = collections && collections.length ? new Set(collections) : null;
  const report = { manifest, dryRun, mode, collections: {} };

  for (const [name, entry] of Object.entries(manifest.collections)) {
    if (only && !only.has(name)) continue;
    const docs = readCollectionFile(dir, entry.file);
    const coll = db.collection(name);
    const scopeFilter = EJSON.deserialize(entry.filter || {}, { relaxed: false });
    const ids = docs.map((d) => d._id);
    const existing = ids.length ? await coll.countDocuments({ _id: { $in: ids } }) : 0;
    const inScope = mode === 'replace' ? await coll.countDocuments(scopeFilter) : 0;
    const stats = { inBackup: docs.length, existing, toDelete: inScope, written: 0, deleted: 0 };

    if (!dryRun) {
      if (mode === 'replace') {
        stats.deleted = (await coll.deleteMany(scopeFilter)).deletedCount;
      }
      for (let i = 0; i < docs.length; i += 1000) {
        const ops = docs.slice(i, i + 1000).map((doc) => ({
          replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        }));
        const res = await coll.bulkWrite(ops, { ordered: false });
        stats.written += (res.upsertedCount || 0) + (res.matchedCount || 0);
      }
    }
    report.collections[name] = stats;
    log(
      `  ${name}: ${docs.length} in backup, ${existing} already present` +
        (mode === 'replace' ? `, ${inScope} to delete` : '') +
        (dryRun ? '' : ` -> written ${stats.written}${mode === 'replace' ? `, deleted ${stats.deleted}` : ''}`)
    );
  }
  return report;
}

// Minimal "--key=value" / "--flag" parser.
function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

async function connect() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set (backend/.env)');
  await mongoose.connect(uri);
  return mongoose.connection.db;
}

module.exports = {
  exportDatabase,
  restoreDatabase,
  readManifest,
  pharmacyFilters,
  parseArgs,
  connect,
  timestamp,
};
