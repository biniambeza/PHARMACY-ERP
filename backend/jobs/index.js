// Background job scheduler (#4). Owner: Notify agent.
//
// server.js calls startJobs() after the database connection is up and stopJobs() on shutdown.
// Env:
//   ENABLE_JOBS        'true' / 'false'. Default: enabled only in production.
//   EXPIRY_JOB_CRON    cron expression for the daily checks (default '0 1 * * *' = 01:00).
//   JOBS_TZ            IANA timezone for every schedule, daily summaries and insurance month
//                      edges. Default 'Africa/Addis_Ababa'.
//   INSURANCE_CLAIM_CRON  monthly draft insurance claims (default '0 2 1 * *' = 02:00 on the 1st),
//                      see jobs/insuranceClaimsJob.js. Gated by ENABLE_JOBS like the daily checks.
//                      Month edges use INSURANCE_CLAIM_TZ, else JOBS_TZ (default Addis Ababa).
//   BACKUP_CRON        automatic database backups (see jobs/backupJob.js). Independent of
//                      ENABLE_JOBS: off unless set.
//   JOBS_CATCHUP_DELAY_MS  delay before the start-up catch-up (default 30000).
// Jobs never run under NODE_ENV=test.
//
// Multi-instance safety: every run goes through runWithLock (jobs/lock.js), a MongoDB lease
// lock per job, so only one instance runs a given job at a time.
// Catch-up: on start-up (after JOBS_CATCHUP_DELAY_MS) jobs whose last successful run is too
// old are run once - e.g. after the free Render instance slept through 01:00. All jobs are
// idempotent (and daily summaries are deduplicated per pharmacy/day), so a catch-up that
// overlaps a scheduled run is harmless.
const cron = require('node-cron');
const { runDailyChecks } = require('./dailyChecks');
const { startBackupJob, stopBackupJob, runBackupLocked, BACKUP_JOB } = require('./backupJob');
const { runInsuranceClaims, DEFAULT_INSURANCE_CLAIM_CRON, claimTimeZone } = require('./insuranceClaimsJob');
const { runWithLock, jobsTimeZone, zonedParts, getJobState, reportJobError } = require('./lock');

const DEFAULT_CRON = '0 1 * * *';
const SUBSCRIPTION_CRON = '15 2 * * *';
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 60 * 60 * 1000; // a run should never take an hour; a crashed holder frees it after that
const DEFAULT_CATCHUP_DELAY_MS = 30 * 1000;

const JOB = {
  daily: 'daily-checks',
  subscriptions: 'subscription-check',
  insurance: 'insurance-claims',
};

let tasks = [];
let catchUpTimer = null;

const jobsEnabled = () => {
  if (process.env.NODE_ENV === 'test') return false;
  const flag = (process.env.ENABLE_JOBS || '').trim().toLowerCase();
  if (flag) return flag === 'true' || flag === '1';
  return process.env.NODE_ENV === 'production';
};

// ------------------------------------------------------------------ job bodies (locked)

const dailyChecksJob = () =>
  runWithLock(JOB.daily, LOCK_TTL_MS, async () => {
    const started = Date.now();
    const results = await runDailyChecks();
    const expired = results.reduce((s, r) => s + (r.expired || 0), 0);
    console.log(
      `[jobs] daily checks done for ${results.length} pharmacies in ${Date.now() - started}ms (${expired} batches expired)`
    );
    return results;
  });

const loadCheckSubscriptions = () => {
  try {
    return require('../controllers/platformAdminController').checkSubscriptions;
  } catch (err) {
    console.warn('[jobs] subscription check not available:', err && err.message);
    return null;
  }
};

const subscriptionsJob = (checkSubscriptions = loadCheckSubscriptions()) =>
  runWithLock(JOB.subscriptions, LOCK_TTL_MS, async () => {
    if (typeof checkSubscriptions !== 'function') return null;
    const summary = await checkSubscriptions();
    console.log('[jobs] subscription check done:', JSON.stringify(summary));
    return summary;
  });

const insuranceClaimsJob = () =>
  runWithLock(JOB.insurance, LOCK_TTL_MS, async () => {
    const results = await runInsuranceClaims();
    const rows = results.flatMap((r) => r.schemes);
    const created = rows.filter((r) => r.status === 'created').length;
    const failed = rows.filter((r) => r.status === 'error').length;
    console.log(`[jobs] insurance claims: ${created} draft claims created for ${results.length} pharmacies (${failed} failed)`);
    if (failed) {
      // Partial failures: keep lastSuccessAt (the job is idempotent) but surface them.
      reportJobError(JOB.insurance, new Error(`${failed} insurance claim(s) failed`));
    }
    return results;
  });

// ------------------------------------------------------------------ catch-up

/** True when the last success is missing or older than maxAgeMs. */
const isStale = (lastSuccessAt, now, maxAgeMs = DAY_MS) =>
  !lastSuccessAt || now.getTime() - new Date(lastSuccessAt).getTime() > maxAgeMs;

/** True when the last success happened before the current calendar month (in timeZone). */
const isBeforeCurrentMonth = (lastSuccessAt, now, timeZone) => {
  if (!lastSuccessAt) return true;
  const last = zonedParts(new Date(lastSuccessAt), timeZone);
  const cur = zonedParts(now, timeZone);
  return last.y * 12 + last.m < cur.y * 12 + cur.m;
};

/**
 * Runs the jobs whose last successful run is too old. Returns the names of the
 * jobs it ran. Exported for tests (call directly with injected runners / now).
 *   daily checks, subscription check: last success older than 24h
 *   insurance claims: last success before the start of the current month (claim zone)
 *   backups (only when BACKUP_CRON is set): last success older than 24h
 */
const runCatchUp = async ({
  now = new Date(),
  env = process.env,
  enabled = jobsEnabled(),
  runners = {},
} = {}) => {
  const run = {
    daily: runners.daily || dailyChecksJob,
    subscriptions: runners.subscriptions || subscriptionsJob,
    insurance: runners.insurance || insuranceClaimsJob,
    backup: runners.backup || runBackupLocked,
  };
  const ran = [];
  const state = async (name) => (await getJobState(name)) || {};

  if (enabled) {
    if (isStale((await state(JOB.daily)).lastSuccessAt, now)) {
      console.log('[jobs] catch-up: running missed daily checks');
      await run.daily();
      ran.push(JOB.daily);
    }
    if (isStale((await state(JOB.subscriptions)).lastSuccessAt, now)) {
      console.log('[jobs] catch-up: running missed subscription check');
      await run.subscriptions();
      ran.push(JOB.subscriptions);
    }
    if (isBeforeCurrentMonth((await state(JOB.insurance)).lastSuccessAt, now, claimTimeZone())) {
      console.log('[jobs] catch-up: running missed monthly insurance claims');
      await run.insurance();
      ran.push(JOB.insurance);
    }
  }
  if ((env.BACKUP_CRON || '').trim() && cron.validate(env.BACKUP_CRON.trim())) {
    if (isStale((await state(BACKUP_JOB)).lastSuccessAt, now)) {
      console.log('[jobs] catch-up: running missed database backup');
      await run.backup();
      ran.push(BACKUP_JOB);
    }
  }
  return ran;
};

const scheduleCatchUp = () => {
  if (process.env.NODE_ENV === 'test' || catchUpTimer) return;
  const raw = Number(process.env.JOBS_CATCHUP_DELAY_MS);
  const delay = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CATCHUP_DELAY_MS;
  catchUpTimer = setTimeout(() => {
    catchUpTimer = null;
    runCatchUp().catch((err) => reportJobError('catch-up', err));
  }, delay);
  if (catchUpTimer.unref) catchUpTimer.unref();
};

// ------------------------------------------------------------------ scheduling

const validExpr = (value, fallback, label) => {
  const expr = (value || fallback).trim();
  if (cron.validate(expr)) return expr;
  console.warn(`[jobs] invalid ${label} "${expr}", falling back to "${fallback}"`);
  return fallback;
};

const startJobs = () => {
  if (process.env.NODE_ENV === 'test') return [];
  const timezone = jobsTimeZone();
  // Automatic backups only depend on BACKUP_CRON.
  try {
    startBackupJob();
  } catch (err) {
    console.warn('[jobs] backup job failed to start:', err && err.message);
  }
  if (!jobsEnabled()) {
    console.log('[jobs] background jobs disabled (set ENABLE_JOBS=true to enable)');
    scheduleCatchUp(); // backups only
    return [];
  }
  if (tasks.length) return tasks; // already started

  console.log(`[jobs] time zone ${timezone}${process.env.JOBS_TZ ? '' : ' (default; set JOBS_TZ to change)'}`);

  const expr = validExpr(process.env.EXPIRY_JOB_CRON, DEFAULT_CRON, 'EXPIRY_JOB_CRON');
  tasks = [cron.schedule(expr, () => dailyChecksJob(), { name: JOB.daily, noOverlap: true, timezone })];
  console.log(`[jobs] daily checks scheduled "${expr}" (${timezone})`);

  // Daily subscription check (#24, Admin/Branches): grace period / suspension.
  if (typeof loadCheckSubscriptions() === 'function') {
    tasks.push(
      cron.schedule(SUBSCRIPTION_CRON, () => subscriptionsJob(), { name: JOB.subscriptions, noOverlap: true, timezone })
    );
    console.log(`[jobs] subscription check scheduled "${SUBSCRIPTION_CRON}" (${timezone})`);
  }

  // Monthly automatic insurance claims (drafts only, never submitted automatically).
  const claimExpr = validExpr(process.env.INSURANCE_CLAIM_CRON, DEFAULT_INSURANCE_CLAIM_CRON, 'INSURANCE_CLAIM_CRON');
  tasks.push(cron.schedule(claimExpr, () => insuranceClaimsJob(), { name: JOB.insurance, noOverlap: true, timezone }));
  console.log(`[jobs] insurance claims scheduled "${claimExpr}" (${timezone}, month edges ${claimTimeZone()})`);

  scheduleCatchUp();
  return tasks;
};

const stopJobs = async () => {
  if (catchUpTimer) {
    clearTimeout(catchUpTimer);
    catchUpTimer = null;
  }
  for (const t of tasks) {
    try {
      await t.stop();
    } catch {
      // ignore
    }
  }
  tasks = [];
  await stopBackupJob();
};

module.exports = {
  startJobs,
  stopJobs,
  jobsEnabled,
  runCatchUp,
  isStale,
  isBeforeCurrentMonth,
  dailyChecksJob,
  subscriptionsJob,
  insuranceClaimsJob,
  JOB,
};
