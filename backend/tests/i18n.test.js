// Server-side localisation of customer/owner-facing texts (receipts, emails, alerts).
const {
  app, request, uid, daysFromNow, connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const Pharmacy = require('../models/Pharmacy');
const Notification = require('../models/Notification');
const notify = require('../services/notify');
const receipts = require('../services/receipts');
const dailyChecks = require('../jobs/dailyChecks');
const { t, normalizeLocale, pharmacyLocale, localDate, MESSAGES } = require('../i18n/messages');
const { gregorianToEthiopian, formatEthiopianDate } = require('../i18n/ethiopianCalendar');

const waitFor = async (fn, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor timed out');
};

const sale = (overrides = {}) => ({
  invoiceNumber: 'INV-0001',
  createdAt: new Date(2024, 8, 11, 10, 30), // local 11 Sep 2024 = Meskerem 1, 2017
  items: [
    { name: 'Paracetamol 500mg', quantity: 2, subtotal: 20 },
    { name: 'Amoxicillin 250mg', quantity: 20, subtotal: 100, unitName: 'strip', unitFactor: 10 },
  ],
  discount: 5,
  grandTotal: 115,
  payments: [
    { method: 'cash', amount: 100 },
    { method: 'insurance', amount: 15 },
  ],
  amountPaid: 115,
  balanceDue: 0,
  change: 20,
  ...overrides,
});

const pharmacy = (locale) => ({ name: 'Abay Pharmacy', phone: '0911000000', settings: { locale, currency: 'ETB' } });

describe('t() helper', () => {
  test('normalises locales and falls back to English', () => {
    expect(normalizeLocale('am-ET')).toBe('am');
    expect(normalizeLocale('fr')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(pharmacyLocale({ settings: { locale: 'om' } })).toBe('om');
    expect(pharmacyLocale(null)).toBe('en');
    expect(t('fr', 'receipt.thankYou')).toBe('Thank you!');
    expect(t('am', 'receipt.thankYou')).toBe('እናመሰግናለን!');
    expect(t('am', 'no.such.key')).toBe('no.such.key');
  });

  test('interpolation and plurals', () => {
    expect(t('en', 'alert.expiredTitle', { count: 1 })).toBe('1 batch expired');
    expect(t('en', 'alert.expiredTitle', { count: 3 })).toBe('3 batches expired');
    // am has no plural variants: the base key is used for every count
    expect(t('am', 'alert.expiredTitle', { count: 3 })).toBe('3 ባች የአገልግሎት ጊዜው አልፏል');
    expect(t('en', 'receipt.total', { amount: 'ETB 1.00' })).toBe('Total: ETB 1.00');
  });

  test('every am/om key exists in English (no orphan keys)', () => {
    const enKeys = new Set(Object.keys(MESSAGES.en).map((k) => k.replace(/_(one|other)$/, '')));
    for (const loc of ['am', 'om']) {
      for (const key of Object.keys(MESSAGES[loc])) expect(enKeys.has(key.replace(/_(one|other)$/, ''))).toBe(true);
    }
  });

  test('Ethiopian dates', () => {
    expect(gregorianToEthiopian(2024, 9, 11)).toEqual({ year: 2017, month: 1, day: 1 });
    expect(gregorianToEthiopian(2023, 9, 12)).toEqual({ year: 2016, month: 1, day: 1 });
    expect(gregorianToEthiopian(2024, 1, 7)).toEqual({ year: 2016, month: 4, day: 28 });
    expect(gregorianToEthiopian(2026, 11, 13)).toEqual({ year: 2019, month: 3, day: 4 });
    expect(formatEthiopianDate(new Date(Date.UTC(2024, 8, 11)), 'am', { utc: true })).toBe('መስከረም 1, 2017 ዓ.ም.');
    expect(localDate('en', new Date(Date.UTC(2024, 8, 11)))).toBe('2024-09-11');
    expect(localDate('am', new Date(Date.UTC(2024, 8, 11)))).toBe('2024-09-11 (መስከረም 1, 2017 ዓ.ም.)');
  });
});

describe('Receipt text', () => {
  test('English output is unchanged', () => {
    const text = receipts.buildReceiptText({ sale: sale(), pharmacy: pharmacy('en') });
    expect(text).toContain('Tel: 0911000000');
    expect(text).toContain('Invoice: INV-0001');
    expect(text).toContain('Date: 2024-09-11 10:30');
    expect(text).not.toContain('E.C.');
    expect(text).toContain('Discount: -ETB 5.00');
    expect(text).toContain('Total: ETB 115.00');
    expect(text).toContain('  Insurance: ETB 15.00');
    expect(text).toContain('Thank you!');
  });

  test('Amharic receipt follows the pharmacy locale', () => {
    const text = receipts.buildReceiptText({ sale: sale(), pharmacy: pharmacy('am') });
    expect(text).toContain('ስልክ: 0911000000');
    expect(text).toContain('ደረሰኝ ቁ.: INV-0001');
    expect(text).toContain('ቀን: 2024-09-11 10:30 (መስከረም 1, 2017 ዓ.ም.)');
    expect(text).toContain('Paracetamol 500mg x2 ETB 20.00');
    expect(text).toContain('ቅናሽ: -ETB 5.00');
    expect(text).toContain('ጠቅላላ: ETB 115.00');
    expect(text).toContain('የተከፈለ: ETB 115.00');
    expect(text).toContain('  ጥሬ ገንዘብ: ETB 100.00');
    expect(text).toContain('  ኢንሹራንስ: ETB 15.00');
    expect(text).toContain('መልስ: ETB 20.00');
    expect(text).toContain('እናመሰግናለን!');
    expect(text).not.toMatch(/Total|Paid|Thank you/);
  });

  test('Amharic SMS (compact) stays short and translated', () => {
    const text = receipts.buildReceiptText({
      sale: sale({ voided: true, balanceDue: 40 }),
      pharmacy: pharmacy('am'),
      compact: true,
      maxItems: 1,
    });
    expect(text).toContain('ሁኔታ: ተሰርዟል');
    expect(text).toContain('+1 ተጨማሪ ዕቃ(ዎች)');
    expect(text).toContain('ቀሪ ዕዳ: ETB 40.00');
    expect(text.length).toBeLessThan(300);
  });

  test('Afaan Oromo receipt and explicit locale override', () => {
    expect(receipts.buildReceiptText({ sale: sale(), pharmacy: pharmacy('om') })).toContain('Waliigala: ETB 115.00');
    expect(receipts.buildReceiptText({ sale: sale(), pharmacy: pharmacy('om'), locale: 'en' })).toContain('Total: ETB 115.00');
  });

  test('receipt subject and method labels', () => {
    expect(receipts.buildReceiptSubject({ sale: sale(), pharmacy: pharmacy('en') })).toBe('Receipt INV-0001 - Abay Pharmacy');
    expect(receipts.buildReceiptSubject({ sale: sale(), pharmacy: pharmacy('am') })).toBe('ደረሰኝ INV-0001 - Abay Pharmacy');
    expect(receipts.methodLabel('mobile_money')).toBe('Mobile money');
    expect(receipts.methodLabel('mobile_money', 'am')).toBe('የሞባይል ገንዘብ');
    expect(receipts.methodLabel('bank_transfer', 'am')).toBe('bank transfer');
  });
});

describe('Emails and alerts (database)', () => {
  beforeAll(() => connectTestDb('i18n'));
  afterAll(disconnectTestDb);
  afterEach(() => jest.restoreAllMocks());

  test('password reset email is in the pharmacy language', async () => {
    const P = await createPharmacist({ login: false });
    await Pharmacy.updateOne({ _id: P.pharmacy._id }, { $set: { 'settings.locale': 'am' } });
    const spy = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: P.email });
    expect(res.status).toBe(200);
    // API response stays English
    expect(res.body.message).toMatch(/If an account exists/);
    await waitFor(() => spy.mock.calls.length > 0);
    const { subject, text, html } = spy.mock.calls[0][0];
    expect(subject).toBe('የይለፍ ቃልዎን ዳግም ያስጀምሩ');
    expect(text).toContain(`ሰላም ${P.user.name}፣`);
    expect(text).toMatch(/reset-password\?token=[a-f0-9]{64}/);
    expect(html).toContain('የይለፍ ቃልዎን ዳግም ያስጀምሩ</a>');
  });

  test('password reset email stays English for an English pharmacy', async () => {
    const P = await createPharmacist({ login: false });
    const spy = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    await request(app).post('/api/auth/forgot-password').send({ email: P.email });
    await waitFor(() => spy.mock.calls.length > 0);
    expect(spy.mock.calls[0][0].subject).toBe('Reset your password');
    expect(spy.mock.calls[0][0].text).toContain(`Hello ${P.user.name},`);
  });

  test('daily checks: alerts and summary in Amharic', async () => {
    const P = await createPharmacist({ login: false });
    await Pharmacy.updateOne(
      { _id: P.pharmacy._id },
      { $set: { 'settings.locale': 'am', 'settings.notify': { email: true, sms: true, dailySummary: true } } }
    );
    const ph = await Pharmacy.findById(P.pharmacy._id).lean();
    const med = await createMedicine(ph._id, { name: `Amox ${uid()}`, minStockLevel: 50 });
    await insertBatchRaw(ph._id, med._id, { batchNo: 'EXP1', quantity: 3, expiryDate: daysFromNow(-1) });
    await insertBatchRaw(ph._id, med._id, { batchNo: 'SOON1', quantity: 4, expiryDate: daysFromNow(10) });

    const emailSpy = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    const smsSpy = jest.spyOn(notify, 'sendSms').mockResolvedValue({ sent: true });
    const stats = await dailyChecks.runPharmacyChecks(ph);
    expect(stats.expired).toBe(1);

    const notes = await Notification.find({ pharmacyId: ph._id }).lean();
    const byType = Object.fromEntries(notes.map((n) => [n.type, n]));
    expect(byType.expired.title).toBe('1 ባች የአገልግሎት ጊዜው አልፏል');
    expect(byType.expired.message).toContain('ከሽያጭ ተወግደዋል፦');
    expect(byType.expired.message).toContain('ባች EXP1፣ ብዛት 3');
    expect(byType.expiring_soon.title).toContain('የአገልግሎት ጊዜው ያልፋል');
    expect(byType.expiring_soon.message).toMatch(/ዓ\.ም\./); // Ethiopian date next to the ISO date
    expect(byType.low_stock.title).toBe('የ1 መድኃኒት ክምችት ዝቅተኛ ነው');

    expect(emailSpy).toHaveBeenCalled();
    const mail = emailSpy.mock.calls[0][0];
    expect(mail.subject).toBe(`${ph.name}፦ የዕለት ማጠቃለያ`);
    expect(mail.text).toContain('ዛሬ የአገልግሎት ጊዜያቸው ያለፈ ባቾች፦ 1');
    expect(smsSpy.mock.calls[0][0].text).toContain('ሽያጮች');
  });

  test('daily checks: English texts unchanged', async () => {
    const P = await createPharmacist({ login: false });
    const ph = await Pharmacy.findById(P.pharmacy._id).lean();
    const med = await createMedicine(ph._id, { name: 'Ibuprofen', minStockLevel: 50 });
    await insertBatchRaw(ph._id, med._id, { batchNo: 'E2', quantity: 2, expiryDate: daysFromNow(-1) });
    const med2 = await createMedicine(ph._id, { name: 'Cetirizine' });
    await insertBatchRaw(ph._id, med2._id, { batchNo: 'E3', quantity: 1, expiryDate: daysFromNow(-1) });
    await dailyChecks.runPharmacyChecks(ph, { summary: false });
    const expired = await Notification.findOne({ pharmacyId: ph._id, type: 'expired' }).lean();
    expect(expired.title).toBe('2 batches expired');
    expect(expired.message).toContain('Removed from sale: ');
    expect(expired.message).toContain('Ibuprofen (batch E2, qty 2)');
    const low = await Notification.findOne({ pharmacyId: ph._id, type: 'low_stock' }).lean();
    expect(low.title).toBe('2 medicines are low on stock');
    expect(low.message).toMatch(/^2 out of stock\. .*\.$/);
  });
});
