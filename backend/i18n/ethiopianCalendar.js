// Gregorian -> Ethiopian (Amete Mihret) date conversion via Julian Day Numbers.
// Same algorithm as frontend/src/utils/ethiopianCalendar.js (verified there against
// ICU's ethiopic calendar for 1950-2099). Leap year: (year + 1) % 4 === 0.
const ETHIOPIC_EPOCH = 1723856; // Meskerem 1, 1 E.C. = JDN 1724221 = this + 365

const MONTHS = {
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜን'],
};
MONTHS.om = MONTHS.en;
const ERA = { en: 'E.C.', om: 'A.L.I.', am: 'ዓ.ም.' };

const floorDiv = (a, b) => Math.floor(a / b);

const gregorianToJdn = (year, month, day) => {
  const a = floorDiv(14 - month, 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + floorDiv(153 * m + 2, 5) + 365 * y + floorDiv(y, 4) - floorDiv(y, 100) + floorDiv(y, 400) - 32045;
};

const gregorianToEthiopian = (year, month, day) => {
  const offset = gregorianToJdn(year, month, day) - ETHIOPIC_EPOCH;
  const r = ((offset % 1461) + 1461) % 1461;
  const n = (r % 365) + 365 * floorDiv(r, 1460);
  return {
    year: 4 * floorDiv(offset, 1461) + floorDiv(r, 365) - floorDiv(r, 1460),
    month: floorDiv(n, 30) + 1,
    day: (n % 30) + 1,
  };
};

/**
 * "መስከረም 1, 2017 ዓ.ም." / "Meskerem 1, 2017 E.C.". utc=true uses the UTC calendar day
 * (for dates stored as UTC midnight, e.g. expiry dates); otherwise the server-local day.
 */
const formatEthiopianDate = (input, lang = 'en', { utc = false } = {}) => {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const et = utc
    ? gregorianToEthiopian(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    : gregorianToEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const base = MONTHS[lang] ? lang : 'en';
  return `${MONTHS[base][et.month - 1]} ${et.day}, ${et.year} ${ERA[base]}`;
};

module.exports = { gregorianToEthiopian, gregorianToJdn, formatEthiopianDate, MONTHS };
