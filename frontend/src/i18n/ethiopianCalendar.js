// Pure Gregorian <-> Ethiopian (Amete Mihret) calendar conversion via Julian Day Numbers.
// No DOM / React imports so it can be unit-tested with `node --test`.
//
// Ethiopian calendar: 12 months of 30 days + Pagume (5 days, 6 in a leap year).
// A year is a leap year when (year % 4 === 3). Meskerem 1 normally falls on
// 11 September (12 September in the Gregorian year before a Gregorian leap year).

// JDN of Meskerem 1 of year 0 (Amete Mihret era). Meskerem 1, 1 E.C. = JDN 1724221.
const ETHIOPIC_EPOCH = 1723856;

export const ETHIOPIAN_MONTHS = {
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'],
  om: ['Fulbaana', 'Onkoloolessa', 'Sadaasa', 'Muddee', 'Amajjii', 'Guraandhala', 'Bitootessa', 'Ebla', 'Caamsaa', 'Waxabajjii', 'Adooleessa', 'Hagayya', 'Qaammee'],
};

const floorDiv = (a, b) => Math.floor(a / b);

/** Gregorian (proleptic) calendar date -> Julian Day Number. month is 1-12. */
export function gregorianToJdn(year, month, day) {
  const a = floorDiv(14 - month, 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + floorDiv(153 * m + 2, 5) + 365 * y + floorDiv(y, 4) - floorDiv(y, 100) + floorDiv(y, 400) - 32045;
}

/** Julian Day Number -> Gregorian { year, month (1-12), day }. */
export function jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = floorDiv(4 * a + 3, 146097);
  const c = a - floorDiv(146097 * b, 4);
  const d = floorDiv(4 * c + 3, 1461);
  const e = c - floorDiv(1461 * d, 4);
  const m = floorDiv(5 * e + 2, 153);
  return {
    day: e - floorDiv(153 * m + 2, 5) + 1,
    month: m + 3 - 12 * floorDiv(m, 10),
    year: 100 * b + d - 4800 + floorDiv(m, 10),
  };
}

/** Julian Day Number -> Ethiopian { year, month (1-13), day }. */
export function jdnToEthiopian(jdn) {
  const offset = jdn - ETHIOPIC_EPOCH;
  const r = ((offset % 1461) + 1461) % 1461;
  const n = (r % 365) + 365 * floorDiv(r, 1460);
  return {
    year: 4 * floorDiv(offset, 1461) + floorDiv(r, 365) - floorDiv(r, 1460),
    month: floorDiv(n, 30) + 1,
    day: (n % 30) + 1,
  };
}

/** Ethiopian { year, month (1-13), day } -> Julian Day Number. */
export function ethiopianToJdn(year, month, day) {
  return ETHIOPIC_EPOCH + 365 + 365 * (year - 1) + floorDiv(year, 4) + 30 * (month - 1) + day - 1;
}

/** Gregorian y/m/d -> Ethiopian { year, month, day }. */
export function gregorianToEthiopian(year, month, day) {
  return jdnToEthiopian(gregorianToJdn(year, month, day));
}

/** Ethiopian y/m/d -> Gregorian { year, month, day }. */
export function ethiopianToGregorian(year, month, day) {
  return jdnToGregorian(ethiopianToJdn(year, month, day));
}

/**
 * Convert a JS Date (or anything `new Date()` accepts) to an Ethiopian date,
 * using the date's local calendar day. Returns null for invalid input.
 */
export function toEthiopianDate(input) {
  if (input === null || input === undefined || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return gregorianToEthiopian(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Format a date in the Ethiopian calendar, e.g. "Meskerem 1, 2017 E.C." (en)
 * or "መስከረም 1 ቀን 2017 ዓ.ም." (am). Returns '' for invalid input.
 */
export function formatEthiopianDate(input, lang = 'en') {
  const et = toEthiopianDate(input);
  if (!et) return '';
  const base = String(lang || 'en').slice(0, 2);
  const months = ETHIOPIAN_MONTHS[base] || ETHIOPIAN_MONTHS.en;
  const name = months[et.month - 1];
  if (base === 'am') return `${name} ${et.day} ቀን ${et.year} ዓ.ም.`;
  if (base === 'om') return `${name} ${et.day}, ${et.year} A.L.I.`;
  return `${name} ${et.day}, ${et.year} E.C.`;
}
