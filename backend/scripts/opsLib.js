// Shared logic for scripts/cloneDatabase.js and scripts/verifyRestore.js.
//
// Everything here takes a native MongoClient / Db so it can be unit tested
// against mongodb-memory-server. The guard functions are pure and throw an
// Error with a human-readable message when an operation is unsafe.
const fs = require('fs');
const path = require('path');
const { readManifest, restoreDatabase } = require('./backupLib');
const { EJSON } = require('mongoose').mongo.BSON;
const zlib = require('zlib');

const RESERVED_DBS = new Set(['admin', 'local', 'config']);

// ------------------------------------------------------------------ args

/** Parses "--key value", "--key=value" and "--flag". */
function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) continue;
    if (m[2] !== undefined) args[m[1]] = m[2];
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[m[1]] = argv[i + 1];
      i += 1;
    } else args[m[1]] = true;
  }
  return args;
}

// ------------------------------------------------------------------ guards

/** Throws unless `name` is a usable, non-system MongoDB database name. */
function assertValidDbName(name, label = 'database') {
  if (typeof name !== 'string' || !name.trim()) throw new Error(`${label} name is required`);
  if (name !== name.trim()) throw new Error(`${label} name "${name}" has leading/trailing spaces`);
  if (/[/\\. "$*<>:|?]/.test(name) || name.length > 63) throw new Error(`Invalid ${label} name "${name}"`);
  if (RESERVED_DBS.has(name.toLowerCase())) throw new Error(`Refusing to use system database "${name}"`);
  return name;
}

const sameDb = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** cloneDatabase: --from and --to must both be valid and different. */
function assertCloneArgs({ from, to }) {
  assertValidDbName(from, '--from');
  assertValidDbName(to, '--to');
  if (sameDb(from, to)) throw new Error(`Refusing to clone: --to "${to}" is the same database as --from "${from}"`);
  return { from, to };
}

/** cloneDatabase: a non-empty target is only overwritten with --force. */
function assertCloneTargetWritable({ to, targetCollections = [], force = false }) {
  const existing = targetCollections.filter((n) => !n.startsWith('system.'));
  if (existing.length && !force) {
    throw new Error(
      `Refusing to clone: target database "${to}" is not empty (${existing.length} collection(s): ` +
        `${existing.slice(0, 5).join(', ')}${existing.length > 5 ? ', ...' : ''}). Pass --force to drop and replace it.`
    );
  }
  return true;
}

/**
 * verifyRestore: the scratch database must differ from the live database and from
 * the database the backup was taken from, and its name must contain "restore" or "test".
 */
function assertScratchTarget({ target, source, backupSource }) {
  assertValidDbName(target, 'target');
  if (source && sameDb(target, source)) {
    throw new Error(`Refusing: target "${target}" is the live database the app is connected to`);
  }
  if (backupSource && sameDb(target, backupSource)) {
    throw new Error(`Refusing: target "${target}" is the database the backup was taken from`);
  }
  if (!/restore|test/i.test(target)) {
    throw new Error(`Refusing: scratch database name "${target}" must contain "restore" or "test"`);
  }
  return target;
}

// ------------------------------------------------------------------ helpers

async function listCollectionInfos(db) {
  const infos = await db.listCollections({}, { nameOnly: false }).toArray();
  return infos.filter((c) => !c.name.startsWith('system.'));
}

async function collectionCounts(db) {
  const counts = {};
  for (const info of await listCollectionInfos(db)) {
    if ((info.type || 'collection') !== 'collection') continue;
    counts[info.name] = await db.collection(info.name).countDocuments({});
  }
  return counts;
}

// ------------------------------------------------------------------ clone

/**
 * Copy every collection (documents, collection options, indexes) and view from
 * database `from` to database `to` on the same client.
 * @returns {Promise<{ collections: object, views: string[] }>}
 */
async function cloneDatabase({ client, from, to, force = false, batchSize = 1000, log = () => {} }) {
  assertCloneArgs({ from, to });
  const src = client.db(from);
  const dst = client.db(to);

  const srcInfos = await listCollectionInfos(src);
  if (!srcInfos.length) throw new Error(`Source database "${from}" has no collections (wrong name?)`);

  const dstNames = (await listCollectionInfos(dst)).map((c) => c.name);
  assertCloneTargetWritable({ to, targetCollections: dstNames, force });
  if (dstNames.length) {
    log(`Dropping existing target database "${to}" (--force)`);
    await dst.dropDatabase();
  }

  const report = { collections: {}, views: [] };
  const collections = srcInfos.filter((c) => (c.type || 'collection') === 'collection');
  const views = srcInfos.filter((c) => c.type === 'view');

  for (const info of collections) {
    const { name } = info;
    // Keep validators, collation, capped / timeseries settings...
    const { autoIndexId, ...options } = info.options || {}; // eslint-disable-line no-unused-vars
    await dst.createCollection(name, options);
    const target = dst.collection(name);

    let copied = 0;
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      await target.insertMany(batch, { ordered: false });
      copied += batch.length;
      batch = [];
    };
    for await (const doc of src.collection(name).find({}).sort({ _id: 1 })) {
      batch.push(doc);
      if (batch.length >= batchSize) await flush();
    }
    await flush();

    const indexes = (await src.collection(name).listIndexes().toArray())
      .filter((idx) => idx.name !== '_id_')
      .map(({ v, ns, ...spec }) => spec); // eslint-disable-line no-unused-vars
    if (indexes.length) await target.createIndexes(indexes);

    const sourceCount = await src.collection(name).countDocuments({});
    const targetCount = await target.countDocuments({});
    report.collections[name] = { source: sourceCount, target: targetCount, copied, indexes: indexes.length };
    log(`  ${name}: ${targetCount}/${sourceCount} documents, ${indexes.length} index(es)`);
  }

  for (const info of views) {
    await dst.createCollection(info.name, { viewOn: info.options.viewOn, pipeline: info.options.pipeline || [] });
    report.views.push(info.name);
    log(`  ${info.name}: view`);
  }

  report.ok = Object.values(report.collections).every((c) => c.source === c.target);
  return report;
}

// ------------------------------------------------------------------ verify restore

/** Newest backup folder (with manifest.json) inside `parent`, or null. */
function latestBackupDir(parent) {
  if (!fs.existsSync(parent)) return null;
  const dirs = fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('backup-') && fs.existsSync(path.join(parent, e.name, 'manifest.json')))
    .map((e) => {
      const full = path.join(parent, e.name);
      let created = 0;
      try {
        created = Date.parse(JSON.parse(fs.readFileSync(path.join(full, 'manifest.json'), 'utf8')).createdAt) || 0;
      } catch {
        created = 0;
      }
      return { full, created, name: e.name };
    })
    .sort((a, b) => b.created - a.created || b.name.localeCompare(a.name));
  return dirs.length ? dirs[0].full : null;
}

function readBackupIds(dir, file) {
  let buf = fs.readFileSync(path.join(dir, file));
  if (file.endsWith('.gz')) buf = zlib.gunzipSync(buf);
  const docs = EJSON.parse(buf.toString('utf8'), { relaxed: false });
  return docs.map((d) => d._id);
}

// Evenly spread sample (first, last and in between).
function sampleOf(list, n) {
  if (list.length <= n) return list.slice();
  if (n <= 1) return [list[0]];
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]);
  return out;
}

/**
 * Restore `dir` into the scratch database `target` and compare it with the backup.
 * @returns {Promise<{ ok: boolean, target: string, dir: string, collections: object }>}
 */
async function verifyRestore({ client, dir, target, source, sampleSize = 20, force = false, drop = false, log = () => {} }) {
  const manifest = readManifest(dir);
  assertScratchTarget({ target, source, backupSource: manifest.database });
  const db = client.db(target);

  const existing = (await listCollectionInfos(db)).map((c) => c.name);
  if (existing.length && !force) {
    throw new Error(`Scratch database "${target}" is not empty. Pass --force to drop it first, or choose another --target.`);
  }
  if (existing.length) await db.dropDatabase();

  const result = { ok: true, target, dir, collections: {} };
  try {
    await restoreDatabase({ db, dir, mode: 'upsert' });
    for (const [name, entry] of Object.entries(manifest.collections)) {
      const restored = await db.collection(name).countDocuments({});
      const ids = sampleOf(readBackupIds(dir, entry.file), sampleSize);
      const found = ids.length ? await db.collection(name).countDocuments({ _id: { $in: ids } }) : 0;
      const ok = restored === entry.count && found === ids.length;
      result.collections[name] = { expected: entry.count, restored, sampled: ids.length, sampleFound: found, ok };
      if (!ok) result.ok = false;
      log(
        `  ${ok ? 'PASS' : 'FAIL'} ${name}: ${restored}/${entry.count} documents, ${found}/${ids.length} sampled _ids found`
      );
    }
  } finally {
    if (drop) {
      await db.dropDatabase();
      result.dropped = true;
      log(`Dropped scratch database "${target}"`);
    }
  }
  return result;
}

module.exports = {
  parseCliArgs,
  assertValidDbName,
  assertCloneArgs,
  assertCloneTargetWritable,
  assertScratchTarget,
  cloneDatabase,
  verifyRestore,
  latestBackupDir,
  collectionCounts,
  sampleOf,
};
