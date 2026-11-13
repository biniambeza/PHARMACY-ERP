// Shared helpers for background jobs:
//   - jobsTimeZone(): IANA zone for schedules / day and month edges (JOBS_TZ, default Africa/Addis_Ababa)
//   - acquireLock / releaseLock / runWithLock: MongoDB lease lock (models/JobLock.js) so a job
//     runs on ONE instance at a time even with several web instances or overlapping deploys
//   - reportJobError: console.error + Sentry.captureException (when Sentry is configured)
//   - zonedParts / zonedDayKey: calendar day / month of an instant in a time zone
const os = require('os');
const crypto = require('crypto');
const JobLock = require('../models/JobLock');

const DEFAULT_JOBS_TZ = 'Africa/Addis_Ababa';
const isTest = () => process.env.NODE_ENV === 'test';

const validTimeZone = (tz) => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** JOBS_TZ when set and valid, else Africa/Addis_Ababa. */
const jobsTimeZone = (env = process.env) => {
  const tz = (env.JOBS_TZ || '').trim();
  if (tz && validTimeZone(tz)) return tz;
  if (tz && !isTest()) console.warn(`[jobs] invalid JOBS_TZ "${tz}", using ${DEFAULT_JOBS_TZ}`);
  return DEFAULT_JOBS_TZ;
};

/** { y, m (0-11), d } of `date` in `timeZone`. */
const zonedParts = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)])
  );
  return { y: parts.year, m: parts.month - 1, d: parts.day };
};

/** 'YYYY-MM-DD' of `date` in `timeZone`. */
const zonedDayKey = (date, timeZone = jobsTimeZone()) => {
  const { y, m, d } = zonedParts(date, timeZone);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// Identifies this process in JobLock.owner (useful when reading the collection).
const PROCESS_OWNER = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;

/**
 * Atomically takes the lease on `name` for `ttlMs`. Returns true when acquired.
 * Free = no document, lockedUntil null or in the past. When two instances race on
 * the very first upsert, the loser gets a duplicate-key error: "not acquired".
 */
const acquireLock = async (name, ttlMs, { owner = PROCESS_OWNER, now = new Date() } = {}) => {
  try {
    const doc = await JobLock.findOneAndUpdate(
      { _id: name, $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: null }] },
      { $set: { lockedUntil: new Date(now.getTime() + ttlMs), owner, lastRunAt: now } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    return Boolean(doc && doc.owner === owner);
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
};

/** Releases the lease if this owner still holds it. */
const releaseLock = async (name, { owner = PROCESS_OWNER } = {}) => {
  await JobLock.updateOne({ _id: name, owner }, { $set: { lockedUntil: null } });
};

let sentryGetter = () => {
  try {
    return require('../instrument').getSentry();
  } catch {
    return null;
  }
};

/** Logs a job failure and sends it to Sentry (only when Sentry is configured). */
const reportJobError = (name, err) => {
  if (!isTest()) console.error(`[jobs] ${name} failed:`, (err && err.message) || err);
  const Sentry = sentryGetter();
  if (Sentry) {
    try {
      Sentry.captureException(err, { tags: { job: name } });
    } catch {
      // monitoring must never break a job
    }
  }
};

/**
 * Runs fn() while holding the lease on `name`. Records lastSuccessAt / lastError
 * and always releases the lease. Never throws (errors are reported and returned).
 * Returns { ran: false, reason: 'locked' } when another instance holds the lock,
 * else { ran: true, result } or { ran: true, error }.
 */
const runWithLock = async (name, ttlMs, fn, { owner = PROCESS_OWNER } = {}) => {
  let acquired = false;
  try {
    acquired = await acquireLock(name, ttlMs, { owner });
  } catch (err) {
    reportJobError(`${name} (lock)`, err);
    return { ran: false, reason: 'lock-error', error: err };
  }
  if (!acquired) {
    if (!isTest()) console.log(`[jobs] ${name} skipped: running on another instance`);
    return { ran: false, reason: 'locked' };
  }
  try {
    const result = await fn();
    await JobLock.updateOne(
      { _id: name },
      { $set: { lastSuccessAt: new Date(), lastError: null } }
    ).catch((e) => reportJobError(`${name} (bookkeeping)`, e));
    return { ran: true, result };
  } catch (err) {
    reportJobError(name, err);
    await JobLock.updateOne(
      { _id: name },
      {
        $set: {
          lastError: String((err && err.message) || err).slice(0, 1000),
          lastErrorAt: new Date(),
        },
      }
    ).catch((e) => reportJobError(`${name} (bookkeeping)`, e));
    return { ran: true, error: err };
  } finally {
    await releaseLock(name, { owner }).catch(() => {});
  }
};

const getJobState = (name) => JobLock.findById(name).lean();

// Test hook: replace the Sentry lookup.
const _setSentryGetter = (fn) => {
  sentryGetter = fn;
};

module.exports = {
  DEFAULT_JOBS_TZ,
  PROCESS_OWNER,
  jobsTimeZone,
  validTimeZone,
  zonedParts,
  zonedDayKey,
  acquireLock,
  releaseLock,
  runWithLock,
  reportJobError,
  getJobState,
  _setSentryGetter,
};
