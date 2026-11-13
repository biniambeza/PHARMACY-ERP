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
} from '../ethiopianCalendar.js';

test('known Gregorian -> Ethiopian dates', () => {
  // Ethiopian New Year 2017 E.C.
  assert.deepEqual(gregorianToEthiopian(2024, 9, 11), { year: 2017, month: 1, day: 1 });
  // New Year 2016 E.C. falls on 12 Sep (year before a Gregorian leap year)
  assert.deepEqual(gregorianToEthiopian(2023, 9, 12), { year: 2016, month: 1, day: 1 });
  // ...so the day before is Pagume 6 of the leap year 2015 E.C.
  assert.deepEqual(gregorianToEthiopian(2023, 9, 11), { year: 2015, month: 13, day: 6 });
  // Last day of 2016 E.C. (not a leap year): Pagume 5
  assert.deepEqual(gregorianToEthiopian(2024, 9, 10), { year: 2016, month: 13, day: 5 });
  // Adwa victory day 2025: 2 March = Yekatit 23, 2017
  assert.deepEqual(gregorianToEthiopian(2025, 3, 2), { year: 2017, month: 6, day: 23 });
  // Genna (Ethiopian Christmas) 7 Jan 2025 = Tahsas 29, 2017
  assert.deepEqual(gregorianToEthiopian(2025, 1, 7), { year: 2017, month: 4, day: 29 });
  // Ethiopian millennium: 12 Sep 2007 = Meskerem 1, 2000
  assert.deepEqual(gregorianToEthiopian(2007, 9, 12), { year: 2000, month: 1, day: 1 });
});

test('JDN round trips', () => {
  assert.equal(gregorianToJdn(2000, 1, 1), 2451545);
  for (let jdn = 2440000; jdn < 2470000; jdn += 37) {
    const g = jdnToGregorian(jdn);
    assert.equal(gregorianToJdn(g.year, g.month, g.day), jdn);
    const e = gregorianToEthiopian(g.year, g.month, g.day);
    assert.deepEqual(ethiopianToGregorian(e.year, e.month, e.day), g);
    assert.ok(e.month >= 1 && e.month <= 13);
    assert.ok(e.day >= 1 && e.day <= (e.month === 13 ? 6 : 30));
  }
});

test('formatEthiopianDate', () => {
  const d = new Date(2024, 8, 11); // local 11 Sep 2024
  assert.deepEqual(toEthiopianDate(d), { year: 2017, month: 1, day: 1 });
  assert.equal(formatEthiopianDate(d), 'Meskerem 1, 2017 E.C.');
  assert.equal(formatEthiopianDate(d, 'am'), 'መስከረም 1 ቀን 2017 ዓ.ም.');
  assert.equal(formatEthiopianDate(null), '');
  assert.equal(formatEthiopianDate('not a date'), '');
});
