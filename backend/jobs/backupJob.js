// Scheduled automatic database backups + rotation.
//
// Off unless BACKUP_CRON is set (and never under NODE_ENV=test). Independent of
// ENABLE_JOBS so a backup schedule can be turned on by itself.
//
// Env:
//   BACKUP_CRON             cron expression, e.g. '30 2 * * *' (02:30 daily). Unset = off.
//   BACKUP_DIR              parent folder for backups (default backend/backups)
//   BACKUP_RETENTION_DAYS   delete job backups older than this many days (default 14, 0 = keep all)
//   BACKUP_GZIP             'false' to write plain JSON (default gzip)
//   JOBS_TZ                 IANA timezone for the schedule (default Africa/Addis_Ababa)
//
// Runs take the 'database-backup' lease lock (jobs/lock.js) so only one instance backs up
// at a time; jobs/index.js catches up a missed run (> 24h since the last success) at start-up.
//
// The newest backup is never deleted by rotation, even if it is older than the
// retention window. Backups on the server disk are NOT off-site: see docs/OPERATIONS.md.
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const mongoose = require('mongoose');
const { exportDatabase } = require('../scripts/backupLib');
const { runWithLock, jobsTimeZone } = require('./lock');

const BACKUP_JOB = 'database-backup';
const BACKUP_LOCK_TTL_MS = 2 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 14;
// Full-database backups created by backup.js / this job: backup-YYYYMMDD-HHmmss[-n]
const FULL_BACKUP_DIR = /^backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?$/;

const backupDir = (env = process.env) =>
  path.resolve(env.BACKUP_DIR && env.BACKUP_DIR.trim() ? env.BACKUP_DIR.trim() : path.join(__dirname, '..', 'backups'));

const retentionDays = (env = process.env) => {
  const raw = env.BACKUP_RETENTION_DAYS;
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_RETENTION_DAYS;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RETENTION_DAYS;
};

// Date encoded in a full-backup folder name (local time, as written by backupLib.timestamp).
const parseBackupDate = (name) => {
  const m = FULL_BACKUP_DIR.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Full backups in `dir`, newest first: [{ name, path, date }]. Only folders with a manifest.json. */
const listBackups = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, path: path.join(dir, e.name), date: parseBackupDate(e.name) }))
    .filter((b) => b.date && fs.existsSync(path.join(b.path, 'manifest.json')))
    .sort((a, b) => b.date - a.date || b.name.localeCompare(a.name));
};

/**
 * Delete full backups older than `days` days. Always keeps the newest backup.
 * @returns {string[]} deleted folder names
 */
const rotateBackups = (dir, days, { now = new Date(), dryRun = false } = {}) => {
  if (!days || days <= 0) return [];
  const cutoff = now.getTime() - days * DAY_MS;
  const [, ...older] = listBackups(dir); // never touch the newest
  const deleted = [];
  for (const b of older) {
    if (b.date.getTime() < cutoff) {
      if (!dryRun) fs.rmSync(b.path, { recursive: true, force: true });
      deleted.push(b.name);
    }
  }
  return deleted;
};

/** One backup run: export everything, then rotate. */
const runBackup = async ({ db = mongoose.connection.db, env = process.env, now = new Date(), log = () => {} } = {}) => {
  if (!db) throw new Error('database not connected');
  const dir = backupDir(env);
  const gzip = String(env.BACKUP_GZIP || 'true').toLowerCase() !== 'false';
  const { dir: out, manifest } = await exportDatabase({ db, outDir: dir, gzip, now });
  const documents = Object.values(manifest.collections).reduce((s, c) => s + c.count, 0);
  const deleted = rotateBackups(dir, retentionDays(env), { now });
  log(`[backup] ${documents} documents in ${Object.keys(manifest.collections).length} collections -> ${out}`);
  if (deleted.length) log(`[backup] rotated ${deleted.length} old backup(s): ${deleted.join(', ')}`);
  return { dir: out, documents, deleted };
};

/** runBackup under the lease lock (never throws; see runWithLock). */
const runBackupLocked = () =>
  runWithLock(BACKUP_JOB, BACKUP_LOCK_TTL_MS, () => runBackup({ log: (line) => console.log(line) }));

let task = null;

const startBackupJob = (env = process.env) => {
  if (env.NODE_ENV === 'test') return null;
  const expr = (env.BACKUP_CRON || '').trim();
  if (!expr) return null;
  if (!cron.validate(expr)) {
    console.warn(`[jobs] invalid BACKUP_CRON "${expr}"; automatic backups are OFF`);
    return null;
  }
  if (task) return task;
  const options = { name: BACKUP_JOB, noOverlap: true, timezone: jobsTimeZone(env) };
  task = cron.schedule(expr, () => runBackupLocked(), options);
  console.log(
    `[jobs] database backup scheduled "${expr}" (${options.timezone}) -> ${backupDir(env)}, ` +
      `retention ${retentionDays(env) || 'unlimited'} day(s)`
  );
  return task;
};

const stopBackupJob = async () => {
  if (!task) return;
  try {
    await task.stop();
  } catch {
    // ignore
  }
  task = null;
};

module.exports = {
  startBackupJob,
  stopBackupJob,
  runBackup,
  runBackupLocked,
  BACKUP_JOB,
  rotateBackups,
  listBackups,
  parseBackupDate,
  backupDir,
  retentionDays,
};
