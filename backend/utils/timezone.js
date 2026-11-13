// Time zone helpers for business-day / month edges that must not depend on the server's
// local time zone or on what a client sends.
//
//   defaultTimeZone()         JOBS_TZ when valid, else Africa/Addis_Ababa (same rule as jobs/lock.js)
//   pharmacyTimeZone(ph)      the pharmacy's configured zone (settings.timezone / timezone) when
//                             valid, else defaultTimeZone(). Never the client's x-timezone header.
//   insuranceTimeZone()       INSURANCE_CLAIM_TZ when valid, else defaultTimeZone() (claims job +
//                             member validity + manual claim periods all use this one)
//   zonedParts(date, tz)      { y, m (0-11), d, h, mi, s } wall clock of an instant in `tz`
//   zonedTime(y, m, d, h, mi, s, ms, tz)  the instant at which the wall clock in `tz` shows that time
//   dayKey(date, tz)          'YYYY-MM-DD' of an instant in `tz`
//   dateOnlyKey(value, tz)    'YYYY-MM-DD' of a stored calendar date: a 'YYYY-MM-DD' string or a
//                             Date at exactly UTC midnight (how date-only inputs are parsed) keeps its
//                             UTC calendar day; any other instant uses its day in `tz`
//   startOfZonedDay(value, tz) / endOfZonedDay(value, tz)  first / last instant of that calendar day in `tz`
const DEFAULT_TZ = 'Africa/Addis_Ababa';

const validTimeZone = (tz) => {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
};

const defaultTimeZone = (env = process.env) => {
  const tz = (env.JOBS_TZ || '').trim();
  return tz && validTimeZone(tz) ? tz : DEFAULT_TZ;
};

const pharmacyTimeZone = (pharmacy, env = process.env) => {
  const candidates = [pharmacy?.settings?.timezone, pharmacy?.settings?.timeZone, pharmacy?.timezone];
  const found = candidates.find((tz) => validTimeZone(tz));
  return found ? found.trim() : defaultTimeZone(env);
};

const insuranceTimeZone = (env = process.env) => {
  const tz = (env.INSURANCE_CLAIM_TZ || '').trim();
  return tz && validTimeZone(tz) ? tz : defaultTimeZone(env);
};

const zonedParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), m: get('month') - 1, d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
};

const zonedTime = (y, m, d, h, mi, s, ms, timeZone) => {
  const guess = Date.UTC(y, m, d, h, mi, s, ms);
  const p = zonedParts(new Date(guess), timeZone);
  const offset = Date.UTC(p.y, p.m, p.d, p.h, p.mi, p.s) - Math.floor(guess / 1000) * 1000;
  return new Date(guess - offset);
};

const pad = (n) => String(n).padStart(2, '0');
const keyOf = ({ y, m, d }) => `${y}-${pad(m + 1)}-${pad(d)}`;

const dayKey = (date, timeZone) => keyOf(zonedParts(new Date(date), timeZone));

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Calendar day { y, m, d } of a stored date value (see the header).
const datePartsOf = (value, timeZone) => {
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value.trim());
    if (match) return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
  }
  const p = zonedParts(date, timeZone);
  return { y: p.y, m: p.m, d: p.d };
};

const dateOnlyKey = (value, timeZone) => {
  const p = datePartsOf(value, timeZone);
  return p ? keyOf(p) : null;
};

const startOfZonedDay = (value, timeZone) => {
  const p = datePartsOf(value, timeZone);
  return p ? zonedTime(p.y, p.m, p.d, 0, 0, 0, 0, timeZone) : null;
};

const endOfZonedDay = (value, timeZone) => {
  const p = datePartsOf(value, timeZone);
  return p ? zonedTime(p.y, p.m, p.d, 23, 59, 59, 999, timeZone) : null;
};

module.exports = {
  DEFAULT_TZ,
  validTimeZone,
  defaultTimeZone,
  pharmacyTimeZone,
  insuranceTimeZone,
  zonedParts,
  zonedTime,
  dayKey,
  dateOnlyKey,
  startOfZonedDay,
  endOfZonedDay,
};
