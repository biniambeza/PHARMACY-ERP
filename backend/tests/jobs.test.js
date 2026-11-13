// Background job safety: lease lock (several instances), catch-up of missed runs,
// per-pharmacy-per-day daily summary, race-free notification dedupe, job time zone.
const { connectTestDb, disconnectTestDb, createPharmacist, uid } = require('./helpers');
const JobLock = require('../models/JobLock');
const Notification = require('../models/Notification');
const notify = require('../services/notify');
const { sendDailySummary, runPharmacyChecks } = require('../jobs/dailyChecks');
const {
  acquireLock, releaseLock, runWithLock, jobsTimeZone, zonedDayKey, _setSentryGetter,
} = require('../jobs/lock');
const { runCatchUp, isStale, isBeforeCurrentMonth, JOB } = require('../jobs/index');
const { BACKUP_JOB } = require('../jobs/backupJob');
const { claimTimeZone } = require('../jobs/insuranceClaimsJob');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeAll(() => connectTestDb('jobs'));
afterAll(disconnectTestDb);
afterEach(() => jest.restoreAllMocks());

describe('lease lock', () => {
  test('only one owner holds the lock; it is free again after release or expiry', async () => {
    const name = `job-${uid()}`;
    expect(await acquireLock(name, 60000, { owner: 'A' })).toBe(true);
    expect(await acquireLock(name, 60000, { owner: 'B' })).toBe(false);
    await releaseLock(name, { owner: 'B' }); // not the owner: no effect
    expect(await acquireLock(name, 60000, { owner: 'B' })).toBe(false);
    await releaseLock(name, { owner: 'A' });
    expect(await acquireLock(name, 60000, { owner: 'B' })).toBe(true);
    // An expired lease (crashed holder) can be taken over.
    expect(await acquireLock(name, 60000, { owner: 'C', now: new Date(Date.now() + 2 * 60000) })).toBe(true);
  });

  test('concurrent first acquisitions (upsert race): exactly one wins', async () => {
    const name = `job-${uid()}`;
    const results = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((owner) => acquireLock(name, 60000, { owner })));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test('runWithLock prevents concurrent runs and records the last success', async () => {
    const name = `job-${uid()}`;
    let running = 0;
    let calls = 0;
    const fn = async () => {
      calls += 1;
      running += 1;
      await new Promise((r) => setTimeout(r, 100));
      running -= 1;
      return 'done';
    };
    const [r1, r2] = await Promise.all([
      runWithLock(name, 60000, fn, { owner: 'instance-1' }),
      runWithLock(name, 60000, fn, { owner: 'instance-2' }),
    ]);
    expect(calls).toBe(1);
    expect([r1.ran, r2.ran].sort()).toEqual([false, true]);
    expect([r1, r2].find((r) => !r.ran).reason).toBe('locked');
    const state = await JobLock.findById(name).lean();
    expect(state.lastSuccessAt).toBeInstanceOf(Date);
    expect(state.lockedUntil).toBeNull();
    // Released: the next run goes through.
    const r3 = await runWithLock(name, 60000, fn, { owner: 'instance-2' });
    expect(r3).toMatchObject({ ran: true, result: 'done' });
  });

  test('a failing job records lastError, releases the lock and reports to Sentry', async () => {
    const name = `job-${uid()}`;
    const captureException = jest.fn();
    _setSentryGetter(() => ({ captureException }));
    try {
      const res = await runWithLock(name, 60000, async () => {
        throw new Error('kaboom');
      });
      expect(res.ran).toBe(true);
      expect(res.error.message).toBe('kaboom');
    } finally {
      _setSentryGetter(() => null);
    }
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1]).toEqual({ tags: { job: name } });
    const state = await JobLock.findById(name).lean();
    expect(state.lastError).toBe('kaboom');
    expect(state.lastSuccessAt).toBeNull();
    expect(await acquireLock(name, 60000, { owner: 'other' })).toBe(true);
  });
});

describe('time zone', () => {
  test('defaults to Africa/Addis_Ababa and honours JOBS_TZ / INSURANCE_CLAIM_TZ', () => {
    expect(jobsTimeZone({})).toBe('Africa/Addis_Ababa');
    expect(jobsTimeZone({ JOBS_TZ: 'Europe/Berlin' })).toBe('Europe/Berlin');
    expect(jobsTimeZone({ JOBS_TZ: 'Not/AZone' })).toBe('Africa/Addis_Ababa');
    const saved = { j: process.env.JOBS_TZ, i: process.env.INSURANCE_CLAIM_TZ };
    try {
      delete process.env.JOBS_TZ;
      delete process.env.INSURANCE_CLAIM_TZ;
      expect(claimTimeZone()).toBe('Africa/Addis_Ababa');
      process.env.INSURANCE_CLAIM_TZ = 'UTC';
      expect(claimTimeZone()).toBe('UTC');
    } finally {
      if (saved.j === undefined) delete process.env.JOBS_TZ;
      else process.env.JOBS_TZ = saved.j;
      if (saved.i === undefined) delete process.env.INSURANCE_CLAIM_TZ;
      else process.env.INSURANCE_CLAIM_TZ = saved.i;
    }
  });

  test('day key follows the zone (22:30 UTC is already the next day in Addis)', () => {
    expect(zonedDayKey(new Date('2026-11-12T22:30:00Z'), 'Africa/Addis_Ababa')).toBe('2026-11-13');
    expect(zonedDayKey(new Date('2026-11-12T22:30:00Z'), 'UTC')).toBe('2026-11-12');
  });
});

describe('catch-up of missed runs', () => {
  const now = new Date('2026-11-13T09:00:00Z');
  const runners = () => ({
    daily: jest.fn().mockResolvedValue({ ran: true }),
    subscriptions: jest.fn().mockResolvedValue({ ran: true }),
    insurance: jest.fn().mockResolvedValue({ ran: true }),
    backup: jest.fn().mockResolvedValue({ ran: true }),
  });
  const setLastSuccess = (name, date) =>
    JobLock.updateOne({ _id: name }, { $set: { lastSuccessAt: date, lockedUntil: null } }, { upsert: true });

  test('helpers: stale after 24h, monthly when the last success is before this month (zone-aware)', () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale(new Date(now.getTime() - 25 * HOUR), now)).toBe(true);
    expect(isStale(new Date(now.getTime() - 2 * HOUR), now)).toBe(false);
    expect(isBeforeCurrentMonth(new Date('2026-10-31T12:00:00Z'), now, 'Africa/Addis_Ababa')).toBe(true);
    expect(isBeforeCurrentMonth(new Date('2026-11-01T00:30:00Z'), now, 'Africa/Addis_Ababa')).toBe(false);
    // 31 Oct 22:00 UTC = 1 Nov 01:00 in Addis: already this month there, not in UTC.
    expect(isBeforeCurrentMonth(new Date('2026-10-31T22:00:00Z'), now, 'Africa/Addis_Ababa')).toBe(false);
    expect(isBeforeCurrentMonth(new Date('2026-10-31T22:00:00Z'), now, 'UTC')).toBe(true);
  });

  test('runs every job whose last success is too old', async () => {
    await setLastSuccess(JOB.daily, new Date(now.getTime() - 3 * DAY));
    await setLastSuccess(JOB.subscriptions, new Date(now.getTime() - 30 * HOUR));
    await setLastSuccess(JOB.insurance, new Date('2026-10-01T02:00:00Z'));
    await setLastSuccess(BACKUP_JOB, new Date(now.getTime() - 2 * DAY));
    const r = runners();
    const ran = await runCatchUp({ now, enabled: true, env: { BACKUP_CRON: '30 2 * * *' }, runners: r });
    expect(ran.sort()).toEqual([BACKUP_JOB, JOB.daily, JOB.insurance, JOB.subscriptions].sort());
    expect(r.daily).toHaveBeenCalledTimes(1);
    expect(r.insurance).toHaveBeenCalledTimes(1);
    expect(r.backup).toHaveBeenCalledTimes(1);
  });

  test('does nothing when the last runs are recent', async () => {
    await setLastSuccess(JOB.daily, new Date(now.getTime() - 2 * HOUR));
    await setLastSuccess(JOB.subscriptions, new Date(now.getTime() - 5 * HOUR));
    await setLastSuccess(JOB.insurance, new Date('2026-11-01T00:00:00Z'));
    await setLastSuccess(BACKUP_JOB, new Date(now.getTime() - 3 * HOUR));
    const r = runners();
    const ran = await runCatchUp({ now, enabled: true, env: { BACKUP_CRON: '30 2 * * *' }, runners: r });
    expect(ran).toEqual([]);
    Object.values(r).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  test('jobs disabled: only a stale backup is caught up, and only when BACKUP_CRON is set', async () => {
    await setLastSuccess(JOB.daily, new Date(now.getTime() - 3 * DAY));
    await setLastSuccess(BACKUP_JOB, new Date(now.getTime() - 3 * DAY));
    let r = runners();
    expect(await runCatchUp({ now, enabled: false, env: {}, runners: r })).toEqual([]);
    r = runners();
    expect(await runCatchUp({ now, enabled: false, env: { BACKUP_CRON: '30 2 * * *' }, runners: r })).toEqual([BACKUP_JOB]);
    expect(r.daily).not.toHaveBeenCalled();
  });
});

describe('daily summary is sent at most once per pharmacy and day', () => {
  const summaryPharmacy = async () => {
    const P = await createPharmacist({ login: false });
    P.pharmacy.settings.notify.dailySummary = true;
    P.pharmacy.settings.notify.email = true;
    P.pharmacy.settings.notify.sms = true;
    P.pharmacy.phone = '+251911000000';
    await P.pharmacy.save();
    return P;
  };

  test('a second run the same day sends nothing', async () => {
    const P = await summaryPharmacy();
    const email = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    const sms = jest.spyOn(notify, 'sendSms').mockResolvedValue({ sent: true });
    const now = new Date();
    const first = await sendDailySummary(P.pharmacy, {}, { now });
    const second = await sendDailySummary(P.pharmacy, {}, { now: new Date(now.getTime() + 1000) });
    expect(first.summarySent).toBe(true);
    expect(second).toEqual({ summarySent: false, alreadySent: true });
    expect(email).toHaveBeenCalledTimes(1);
    expect(sms).toHaveBeenCalledTimes(1);
  });

  test('two concurrent full runs (two instances) send one summary', async () => {
    const P = await summaryPharmacy();
    const email = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    await Promise.all([runPharmacyChecks(P.pharmacy), runPharmacyChecks(P.pharmacy)]);
    expect(email).toHaveBeenCalledTimes(1);
  });

  test('the next local day sends again', async () => {
    const P = await summaryPharmacy();
    const email = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    const now = new Date();
    await sendDailySummary(P.pharmacy, {}, { now });
    await sendDailySummary(P.pharmacy, {}, { now: new Date(now.getTime() + DAY) });
    expect(email).toHaveBeenCalledTimes(2);
  });
});

describe('notification dedupe is race-free', () => {
  test('concurrent creates with the same dedupe key create one notification', async () => {
    const P = await createPharmacist({ login: false });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        notify.createNotification({ pharmacyId: P.pharmacy._id, type: 'system', title: `Hi ${i}`, dedupeKey: 'race' })
      )
    );
    expect(results.filter((n) => n && n.wasCreated)).toHaveLength(1);
    expect(await Notification.countDocuments({ pharmacyId: P.pharmacy._id, dedupeKey: 'race' })).toBe(1);
  });
});
