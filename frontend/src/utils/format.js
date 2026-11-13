// Locale- and currency-aware formatting helpers.
//
// The app calls setDefaultCurrency()/setDefaultLocale() (or applyPharmacySettings() from
// src/i18n) after loading the pharmacy settings. Existing signatures are unchanged:
//   formatMoney(amount, currency?)  formatDate(d, options?)  formatDateTime(d)
import { formatEthiopianDate as formatEthiopian } from '../i18n/ethiopianCalendar.js';

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

export const formatDate = (d, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
  const date = toDate(d);
  if (!date) return '';
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
export const formatEthiopianDate = (d, lang = defaultLocale) => formatEthiopian(d, lang);
