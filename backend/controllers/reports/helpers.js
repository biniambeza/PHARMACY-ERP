// Shared report helpers: timezone-aware dates and ?range= parsing.
const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_PO_STATUSES = ['ordered', 'partially_received'];

// Validate the client's IANA timezone (x-timezone header or ?timezone=) and
// return its canonical name. Falls back to UTC when missing or invalid, so the
// value is always safe to hand to MongoDB's $dateToString.
const getClientTimezone = (req) => {
  const raw = req?.headers?.['x-timezone'] || req?.query?.timezone;
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= 64) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone || 'UTC';
    } catch {
      // invalid timezone string: fall through
    }
  }
  return 'UTC';
};

// aggregate() does not auto-cast, so the tenant id must be a real ObjectId.
const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (id && mongoose.Types.ObjectId.isValid(String(id))) return new mongoose.Types.ObjectId(String(id));
  throw new AppError('Invalid pharmacy context', 400);
};

const round2 = (n) => Number((n || 0).toFixed(2));

// Helper to format Date into YYYY-MM-DD in the target timezone
const getLocalDateString = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().split('T')[0];
  }
};

// Helper to format weekday ('Thu', 'Wed', etc.) in the target timezone
const getLocalDayName = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
};

// Helper to format month and day ('Oct 8', 'Oct 7', etc.) in the target timezone
const getLocalMonthDay = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};

// Helper to format timestamps into relative time strings
const formatRelativeTime = (date) => {
  if (!date) return 'Recently';
  const diffSec = Math.floor((new Date() - new Date(date)) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

// Group expression: local calendar day (YYYY-MM-DD) of a date field.
const localDayExpr = (dateExpr, timeZone) => ({
  $dateToString: { format: '%Y-%m-%d', date: dateExpr, timezone: timeZone },
});

const localMonthExpr = (dateExpr, timeZone) => ({
  $dateToString: { format: '%Y-%m', date: dateExpr, timezone: timeZone },
});

// ---------------------------------------------------------------------------
// Time ranges
// ---------------------------------------------------------------------------

// Offset (ms) of `timeZone` from UTC at instant `date`.
const tzOffsetMs = (date, timeZone) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return 0;
  }
};

// UTC instant of local midnight for local calendar date y-m-d (month 1-based; day may overflow).
const localMidnight = (y, m, d, timeZone) => {
  const guess = Date.UTC(y, m - 1, d);
  const off1 = tzOffsetMs(new Date(guess), timeZone);
  let result = guess - off1;
  const off2 = tzOffsetMs(new Date(result), timeZone);
  if (off2 !== off1) result = guess - off2;
  return new Date(result);
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const parseLocalDate = (value, field) => {
  if (typeof value !== 'string') throw new AppError(`${field} must be a date (YYYY-MM-DD)`, 400);
  const m = DATE_RE.exec(value.trim().slice(0, 10));
  if (!m) throw new AppError(`${field} must be a date (YYYY-MM-DD)`, 400);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new AppError(`${field} is not a valid date`, 400);
  }
  return [y, mo, d];
};

const RANGES = ['today', '7d', 'monthly', '30d', 'yearly', 'custom', 'all'];

// Resolves ?range=7d|monthly|yearly|today|all|custom (&from=YYYY-MM-DD&to=YYYY-MM-DD)
// into a half-open window [from, to) in the client's timezone, plus the
// previous comparable window [prevFrom, prevTo).
// - 7d: the last 7 local days incl. today; monthly/30d: the last 30 local days;
//   yearly: the current local year to date (previous = same span last year);
//   custom: from..to inclusive local days; all: everything (no previous).
// Passing from/to without range implies custom.
const parseRange = (req, defaultRange = '7d', { maxYears = null } = {}) => {
  const timeZone = getClientTimezone(req);
  const q = req.query || {};
  let raw = q.range;
  if (raw === undefined && (q.from !== undefined || q.to !== undefined)) raw = 'custom';
  if (raw === undefined) raw = defaultRange;
  if (typeof raw !== 'string') throw new AppError('Invalid range parameter', 400);
  let range = raw.toLowerCase();
  if (!RANGES.includes(range)) throw new AppError(`range must be one of ${RANGES.join(', ')}`, 400);
  if (range === '30d') range = 'monthly';

  const nowMs = Date.now();
  const [y, m, d] = getLocalDateString(new Date(nowMs), timeZone).split('-').map(Number);
  const tomorrow = localMidnight(y, m, d + 1, timeZone);
  let from;
  let to = tomorrow;
  let prevFrom = null;
  let prevTo = null;
  let label;

  switch (range) {
    case 'today':
      from = localMidnight(y, m, d, timeZone);
      label = 'Today';
      break;
    case 'monthly':
      from = localMidnight(y, m, d - 29, timeZone);
      label = 'Last 30 days';
      break;
    case 'yearly':
      from = localMidnight(y, 1, 1, timeZone);
      prevFrom = localMidnight(y - 1, 1, 1, timeZone);
      prevTo = localMidnight(y - 1, m, d + 1, timeZone);
      label = `${y} year to date`;
      break;
    case 'custom': {
      if (q.from === undefined || q.to === undefined) {
        throw new AppError('Custom range needs both from and to (YYYY-MM-DD)', 400);
      }
      const [fy, fm, fd] = parseLocalDate(q.from, 'from');
      const [ty, tm, td] = parseLocalDate(q.to, 'to');
      from = localMidnight(fy, fm, fd, timeZone);
      to = localMidnight(ty, tm, td + 1, timeZone);
      if (to <= from) throw new AppError('from must be on or before to', 400);
      if (to - from > 3700 * DAY_MS) throw new AppError('Custom range cannot exceed 10 years', 400);
      label = `${q.from.slice(0, 10)} to ${q.to.slice(0, 10)}`;
      break;
    }
    case 'all':
      from = new Date(0);
      label = 'All time';
      break;
    case '7d':
    default:
      from = localMidnight(y, m, d - 6, timeZone);
      label = 'Last 7 days';
      break;
  }

  // Heavy reports cap the window: 'all' becomes the last `maxYears` years and
  // longer custom ranges are refused.
  let capped = false;
  if (maxYears) {
    if (range === 'custom' && to.getTime() - from.getTime() > maxYears * 366 * DAY_MS) {
      throw new AppError(`Reports can cover at most ${maxYears} years. Choose a shorter date range.`, 400);
    }
    if (range === 'all') {
      from = localMidnight(y - maxYears, m, d + 1, timeZone);
      label = `Last ${maxYears} years`;
      capped = true;
    }
  }

  if (range !== 'all' && !prevFrom) {
    prevTo = from;
    prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  }

  return { range, label, from, to, prevFrom, prevTo, timeZone, capped };
};

// ---------------------------------------------------------------------------
// Request-path limits for heavy reports
// ---------------------------------------------------------------------------

// Server-side time limit for every report query (MongoDB aborts with MaxTimeMSExpired).
const REPORT_MAX_TIME_MS = 20000;
// Options for Model.aggregate(...).option(REPORT_AGG_OPTS)
const REPORT_AGG_OPTS = Object.freeze({ maxTimeMS: REPORT_MAX_TIME_MS });
// Longest window a heavy report may cover ('all' is clamped to it, custom ranges beyond it get a 400).
const MAX_REPORT_YEARS = 3;

// parseRange with the heavy-report cap applied.
const parseReportRange = (req, defaultRange = '7d') => parseRange(req, defaultRange, { maxYears: MAX_REPORT_YEARS });

// Start of the period for queries: null means "since the beginning" (uncapped 'all').
const periodStart = (period) => (period.range === 'all' && !period.capped ? null : period.from);

// MongoDB error code 50 = MaxTimeMSExpired (the server stopped the query).
const isQueryTimeout = (err) =>
  Boolean(err) &&
  (err.code === 50 ||
    err.codeName === 'MaxTimeMSExpired' ||
    (err.cause && (err.cause.code === 50 || err.cause.codeName === 'MaxTimeMSExpired')));

// Wraps a report handler: a query time-out becomes a friendly 503 instead of a 500.
const withReportTimeout = (handler) =>
  async function reportHandler(req, res, next) {
    try {
      return await handler(req, res, next);
    } catch (err) {
      if (isQueryTimeout(err)) {
        throw new AppError(
          'This report is taking too long to prepare. Try a shorter date range, or try again in a few minutes.',
          503
        );
      }
      throw err;
    }
  };

module.exports = {
  DAY_MS,
  getClientTimezone,
  OPEN_PO_STATUSES,
  toObjectId,
  round2,
  getLocalDateString,
  getLocalDayName,
  getLocalMonthDay,
  formatRelativeTime,
  localDayExpr,
  localMonthExpr,
  parseRange,
  parseReportRange,
  periodStart,
  REPORT_MAX_TIME_MS,
  REPORT_AGG_OPTS,
  MAX_REPORT_YEARS,
  isQueryTimeout,
  withReportTimeout,
};
