// Run with (from frontend/): node --test src/i18n/__tests__/ethiopianCalendar.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gregorianToEthiopian,
  ethiopianToGregorian,
  gregorianToJdn,
  jdnToGregorian,
  formatEthiopianDate,
  toEthiopianDate,
  isEthiopianLeapYear,
} from '../../utils/ethiopianCalendar.js';
import { formatDate, formatDateTime, getCalendar, setCalendar, setDefaultLocale, defaultCalendarFor } from '../../utils/format.js';

test('known Gregorian -> Ethiopian dates', () => {
  // Ethiopian New Year 2017 E.C.
  assert.deepEqual(gregorianToEthiopian(2024, 9, 11), { year: 2017, month: 1, day: 1 });
  // New Year 2016 E.C. falls on 12 Sep (year before a Gregorian leap year)
  assert.deepEqual(gregorianToEthiopian(2023, 9, 12), { year: 2016, month: 1, day: 1 });
  // ...so the day before is Pagume 6 of the leap year 2015 E.C.
  assert.deepEqual(gregorianToEthiopian(2023, 9, 11), { year: 2015, month: 13, day: 6 });
  // Last day of 2016 E.C. (not a leap year): Pagume 5
  assert.deepEqual(gregorianToEthiopian(2024, 9, 10), { year: 2016, month: 13, day: 5 });
  // Genna 2024 (7 Jan, after a leap Pagume) = Tahsas 28, 2016
  assert.deepEqual(gregorianToEthiopian(2024, 1, 7), { year: 2016, month: 4, day: 28 });
  // Genna 2025 (7 Jan) = Tahsas 29, 2017
  assert.deepEqual(gregorianToEthiopian(2025, 1, 7), { year: 2017, month: 4, day: 29 });
  // 13 Nov 2026 = Hidar 4, 2019 (Meskerem 1 = 11 Sep 2026 -> day 64 of the year)
  assert.deepEqual(gregorianToEthiopian(2026, 11, 13), { year: 2019, month: 3, day: 4 });
  // ...and Tikimt 4, 2019 = 14 Oct 2026
  assert.deepEqual(ethiopianToGregorian(2019, 2, 4), { year: 2026, month: 10, day: 14 });
  // Adwa victory day 2025: 2 March = Yekatit 23, 2017
  assert.deepEqual(gregorianToEthiopian(2025, 3, 2), { year: 2017, month: 6, day: 23 });
  // Ethiopian millennium: 12 Sep 2007 = Meskerem 1, 2000
  assert.deepEqual(gregorianToEthiopian(2007, 9, 12), { year: 2000, month: 1, day: 1 });
  // 2019 E.C. is a leap year -> next new year on 12 Sep 2027
  assert.deepEqual(gregorianToEthiopian(2027, 9, 11), { year: 2019, month: 13, day: 6 });
  assert.deepEqual(gregorianToEthiopian(2027, 9, 12), { year: 2020, month: 1, day: 1 });
});

test('leap years', () => {
  assert.equal(isEthiopianLeapYear(2015), true);
  assert.equal(isEthiopianLeapYear(2016), false);
  assert.equal(isEthiopianLeapYear(2019), true);
});

test('JDN round trips', () => {
  assert.equal(gregorianToJdn(2000, 1, 1), 2451545);
  for (let jdn = 2440000; jdn < 2470000; jdn += 37) {
    const g = jdnToGregorian(jdn);
    assert.equal(gregorianToJdn(g.year, g.month, g.day), jdn);
    const e = gregorianToEthiopian(g.year, g.month, g.day);
    assert.deepEqual(ethiopianToGregorian(e.year, e.month, e.day), g);
    assert.ok(e.month >= 1 && e.month <= 13);
    assert.ok(e.day >= 1 && e.day <= (e.month === 13 ? (isEthiopianLeapYear(e.year) ? 6 : 5) : 30));
  }
});

test('formatEthiopianDate', () => {
  const d = new Date(2024, 8, 11); // local 11 Sep 2024
  assert.deepEqual(toEthiopianDate(d), { year: 2017, month: 1, day: 1 });
  assert.deepEqual(toEthiopianDate('2024-09-11'), { year: 2017, month: 1, day: 1 });
  assert.equal(formatEthiopianDate(d), 'Meskerem 1, 2017 E.C.');
  assert.equal(formatEthiopianDate(d, 'am'), 'መስከረም 1 ቀን 2017 ዓ.ም.');
  assert.equal(formatEthiopianDate(d, 'am', 'medium'), 'መስከረም 1, 2017 ዓ.ም.');
  assert.equal(formatEthiopianDate('2023-09-11', 'am'), 'ጳጉሜን 6 ቀን 2015 ዓ.ም.');
  assert.equal(formatEthiopianDate(null), '');
  assert.equal(formatEthiopianDate('not a date'), '');
});

test('format.js calendar preference (no localStorage in node -> language default)', () => {
  assert.equal(defaultCalendarFor('am'), 'ethiopian');
  assert.equal(defaultCalendarFor('en'), 'gregorian');
  setDefaultLocale('en');
  assert.equal(getCalendar(), 'gregorian');
  assert.match(formatDate('2024-09-11T09:00:00'), /2024/);
  setDefaultLocale('am');
  assert.equal(getCalendar(), 'ethiopian');
  assert.equal(formatDate('2024-09-11'), 'መስከረም 1, 2017 ዓ.ም.');
  assert.match(formatDateTime(new Date(2024, 8, 11, 14, 5)), /^መስከረም 1, 2017 ዓ\.ም\. .+/);
  assert.equal(setCalendar('ethiopian'), 'ethiopian'); // storage unavailable: never throws
  setDefaultLocale('en');
});
