// Locale- and currency-aware formatting helpers.
//
// The app calls setDefaultCurrency()/setDefaultLocale() (or applyPharmacySettings() from
// src/i18n) after loading the pharmacy settings. Existing signatures are unchanged:
//   formatMoney(amount, currency?)  formatDate(d, options?)  formatDateTime(d)
//
// Calendar (DISPLAY only): formatDate/formatDateTime show Ethiopian calendar dates when the
// calendar preference is 'ethiopian'. Values sent to the API and <input type="date"> values
// stay Gregorian ISO. Preference: localStorage[CALENDAR_KEY] (per device) -> 'ethiopian'
// when the language is Amharic -> 'gregorian'.
import { formatEthiopianDate as formatEthiopian } from './ethiopianCalendar.js';

export const CALENDAR_KEY = 'calendar';
export const CALENDARS = ['gregorian', 'ethiopian'];

const normalizeCalendar = (value) => (CALENDARS.includes(value) ? value : null);

const readStoredCalendar = () => {
  try {
    return typeof localStorage === 'undefined' ? null : normalizeCalendar(localStorage.getItem(CALENDAR_KEY));
  } catch {
    return null;
  }
};

// App language code -> BCP 47 locale used for Intl.
const INTL_LOCALES = { en: 'en-US', am: 'am-ET', om: 'om-ET' };

let defaultCurrency = 'ETB';
let defaultLocale = 'en';

export const setDefaultCurrency = (code) => {
  if (typeof code === 'string' && /^[A-Za-z]{3}$/.test(code.trim())) {
    defaultCurrency = code.trim().toUpperCase();
  }
};

export const setDefaultLocale = (loc) => {
  if (typeof loc === 'string' && loc.trim()) defaultLocale = loc.trim();
};

export const getDefaultCurrency = () => defaultCurrency;
export const getDefaultLocale = () => defaultLocale;

/** Default calendar for a language when the user has not chosen one. */
export const defaultCalendarFor = (loc) => (String(loc || '').slice(0, 2) === 'am' ? 'ethiopian' : 'gregorian');

/** Active display calendar: explicit per-device choice, else language default. */
export const getCalendar = () => readStoredCalendar() || defaultCalendarFor(defaultLocale);

/** Persist an explicit calendar choice (null/'' clears it, back to the language default). */
export const setCalendar = (value) => {
  const cal = normalizeCalendar(value);
  try {
    if (cal) localStorage.setItem(CALENDAR_KEY, cal);
    else localStorage.removeItem(CALENDAR_KEY);
  } catch {
    /* storage unavailable: preference not saved */
  }
  return getCalendar();
};

// Resolve to a locale Intl actually supports (om-ET is missing in some browsers).
const intlLocale = (loc = defaultLocale) => {
  const candidate = INTL_LOCALES[loc] || loc;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([candidate]).length ? candidate : 'en-US';
  } catch {
    return 'en-US';
  }
};

const numberFormatCache = new Map();
const getNumberFormat = (locale, currency) => {
  const key = `${locale}|${currency || ''}`;
  if (!numberFormatCache.has(key)) {
    let fmt;
    try {
      fmt = currency
        ? new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            currencyDisplay: 'code',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      // Unknown currency code: fall back to plain number + code prefix.
      fmt = null;
    }
    numberFormatCache.set(key, fmt);
  }
  return numberFormatCache.get(key);
};

const plainNumber = (value, locale) =>
  value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * formatMoney(1234.5) -> "ETB 1,234.50" (currency defaults to the pharmacy currency).
 * Pass currency = '' / null to get only the number.
 */
export const formatMoney = (amount, currency = defaultCurrency) => {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const locale = intlLocale();
  if (!currency) return plainNumber(value, locale);
  const fmt = getNumberFormat(locale, currency);
  if (!fmt) return `${currency} ${plainNumber(value, locale)}`;
  // Normalise the non-breaking space Intl puts between code and number.
  return fmt.format(value).replace(/\u00a0/g, ' ');
};

/** Plain number formatting in the current locale (no currency). */
export const formatNumber = (value, options = {}) => {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString(intlLocale(), options);
};

const toDate = (d) => {
  if (d === null || d === undefined || d === '') return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
};

const hasDatePart = (o) => Boolean(o && (o.year || o.month || o.day || o.dateStyle));
const hasTimePart = (o) => Boolean(o && (o.hour || o.minute || o.timeStyle));

const formatTime = (date, options) => {
  const timeOptions = {};
  for (const k of ['hour', 'minute', 'second', 'hour12', 'hourCycle', 'timeZone']) {
    if (options[k] !== undefined) timeOptions[k] = options[k];
  }
  if (options.timeStyle) timeOptions.timeStyle = options.timeStyle;
  try {
    return date.toLocaleTimeString(intlLocale(), timeOptions);
  } catch {
    return date.toLocaleTimeString('en-US', timeOptions);
  }
};

export const formatDate = (d, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
  // A bare 'YYYY-MM-DD' is a calendar day; keep it on that day in the Ethiopian view.
  const date = toDate(d);
  if (!date) return '';
  if (getCalendar() === 'ethiopian' && hasDatePart(options)) {
    const datePart = formatEthiopian(typeof d === 'string' ? d : date, defaultLocale, 'medium');
    return hasTimePart(options) ? `${datePart} ${formatTime(date, options)}` : datePart;
  }
  try {
    return date.toLocaleDateString(intlLocale(), options);
  } catch {
    return date.toLocaleDateString('en-US', options);
  }
};

export const formatDateTime = (d) =>
  formatDate(d, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Ethiopian calendar date, e.g. "Meskerem 1, 2017 E.C." / "መስከረም 1 ቀን 2017 ዓ.ም.".
 * Language defaults to the current app locale.
 */
export const formatEthiopianDate = (d, lang = defaultLocale, style = 'long') => formatEthiopian(d, lang, style);

/**
 * Hint to show next to a Gregorian <input type="date"> value: the Ethiopian equivalent
 * when the Ethiopian calendar is active, '' otherwise (or for an empty/invalid value).
 */
export const ethiopianDateHint = (isoDate) =>
  getCalendar() === 'ethiopian' ? formatEthiopian(isoDate, defaultLocale, 'medium') : '';
