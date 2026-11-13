// Background job scheduler (#4). Owner: Notify agent.
//
// server.js calls startJobs() after the database connection is up.
// Env:
//   ENABLE_JOBS        'true' / 'false'. Default: enabled only in production.
//   EXPIRY_JOB_CRON    cron expression for the daily checks (default '0 1 * * *' = 01:00).
//   JOBS_TZ            optional IANA timezone for the schedule (default: server time).
// Jobs never run under NODE_ENV=test.
const cron = require('node-cron');
const { runDailyChecks } = require('./dailyChecks');

const DEFAULT_CRON = '0 1 * * *';
let tasks = [];

const jobsEnabled = () => {
  if (process.env.NODE_ENV === 'test') return false;
  const flag = (process.env.ENABLE_JOBS || '').trim().toLowerCase();
  if (flag) return flag === 'true' || flag === '1';
  return process.env.NODE_ENV === 'production';
};

const startJobs = () => {
  if (!jobsEnabled()) {
    if (process.env.NODE_ENV !== 'test') console.log('[jobs] background jobs disabled (set ENABLE_JOBS=true to enable)');
    return [];
  }
  if (tasks.length) return tasks; // already started

  let expr = (process.env.EXPIRY_JOB_CRON || DEFAULT_CRON).trim();
  if (!cron.validate(expr)) {
    console.warn(`[jobs] invalid EXPIRY_JOB_CRON "${expr}", falling back to "${DEFAULT_CRON}"`);
    expr = DEFAULT_CRON;
  }
  const options = { name: 'daily-checks', noOverlap: true };
  if (process.env.JOBS_TZ) options.timezone = process.env.JOBS_TZ;

  const task = cron.schedule(
    expr,
    async () => {
      const started = Date.now();
      try {
        const results = await runDailyChecks();
        const expired = results.reduce((s, r) => s + (r.expired || 0), 0);
        console.log(
          `[jobs] daily checks done for ${results.length} pharmacies in ${Date.now() - started}ms (${expired} batches expired)`
        );
      } catch (err) {
        console.error('[jobs] daily checks failed:', err && err.message);
      }
    },
    options
  );
  tasks = [task];
  console.log(`[jobs] daily checks scheduled "${expr}"${options.timezone ? ` (${options.timezone})` : ''}`);

  // Daily subscription check (#24, Admin/Branches): grace period / suspension.
  let checkSubscriptions = null;
  try {
    ({ checkSubscriptions } = require('../controllers/platformAdminController'));
  } catch (err) {
    console.warn('[jobs] subscription check not available:', err && err.message);
  }
  if (typeof checkSubscriptions === 'function') {
    const subOptions = { name: 'subscription-check', noOverlap: true };
    if (process.env.JOBS_TZ) subOptions.timezone = process.env.JOBS_TZ;
    const subTask = cron.schedule(
      '15 2 * * *',
      async () => {
        try {
          const summary = await checkSubscriptions();
          console.log('[jobs] subscription check done:', JSON.stringify(summary));
        } catch (err) {
          console.error('[jobs] subscription check failed:', err && err.message);
        }
      },
      subOptions
    );
    tasks.push(subTask);
    console.log('[jobs] subscription check scheduled "15 2 * * *"');
  }
  return tasks;
};

const stopJobs = async () => {
  for (const t of tasks) {
    try {
      await t.stop();
    } catch {
      // ignore
    }
  }
  tasks = [];
};

module.exports = { startJobs, stopJobs, jobsEnabled };
