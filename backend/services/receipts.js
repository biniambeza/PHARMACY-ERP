// Plain-text receipts for digital delivery (SMS / email / copy & share).
// buildReceiptText({ sale, pharmacy, compact?, locale? }) -> string
// Texts follow the pharmacy language (settings.locale: en | am | om), see backend/i18n.
const { t, pharmacyLocale, normalizeLocale, localDate } = require('../i18n/messages');

const METHODS = ['cash', 'card', 'mobile_money', 'credit', 'store_credit', 'insurance'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const fmtMoney = (amount, currency = 'ETB') => {
  const value = round2(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${value}` : value;
};

const methodLabel = (m, locale = 'en') =>
  METHODS.includes(m) ? t(locale, `method.${m}`) : String(m || 'other').replace(/_/g, ' ');

const fmtDate = (d) => {
  const date = d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Payments shown on the receipt (failed attempts are left out). Legacy sales without
// payments[] fall back to paymentMethod + amountPaid/grandTotal.
const receiptPayments = (sale) => {
  const list = Array.isArray(sale.payments) ? sale.payments.filter((p) => p && p.status !== 'failed') : [];
  if (list.length) return list;
  return [{ method: sale.paymentMethod || 'cash', amount: sale.amountPaid ?? sale.grandTotal }];
};

const amountPaid = (sale) => {
  if (sale.amountPaid !== undefined && sale.amountPaid !== null) return Number(sale.amountPaid) || 0;
  return receiptPayments(sale).reduce((s, p) => s + (Number(p.amount) || 0), 0);
};

/**
 * Builds a short text receipt.
 * compact=true (SMS) keeps it brief: at most `maxItems` item lines and no footer.
 * locale defaults to the pharmacy's settings.locale (falls back to English).
 */
const buildReceiptText = ({ sale, pharmacy, compact = false, maxItems = 5, locale } = {}) => {
  if (!sale) return '';
  const settings = (pharmacy && pharmacy.settings) || {};
  const loc = locale ? normalizeLocale(locale) : pharmacyLocale(pharmacy);
  const tr = (key, vars) => t(loc, key, vars);
  const currency = settings.currency || 'ETB';
  const money = (v) => fmtMoney(v, currency);
  const lines = [];

  lines.push(pharmacy?.name || tr('receipt.pharmacy'));
  if (!compact) {
    if (pharmacy?.address) lines.push(pharmacy.address);
    if (pharmacy?.phone) lines.push(tr('receipt.tel', { phone: pharmacy.phone }));
    const tin = pharmacy?.tin || settings.tax?.registrationNo;
    if (tin) lines.push(tr('receipt.tin', { tin }));
  }
  lines.push(tr('receipt.invoice', { number: sale.invoiceNumber }));
  const soldAt = sale.offlineCreatedAt || sale.createdAt || new Date();
  // Amharic: Gregorian date/time plus the Ethiopian calendar date (full receipt only, SMS stays short).
  const dateText = compact ? fmtDate(soldAt) : localDate(loc, soldAt, { gregorian: fmtDate(soldAt), utc: false });
  lines.push(tr('receipt.date', { date: dateText }));
  if (sale.voided) lines.push(tr('receipt.statusVoided'));
  else if (sale.returnStatus === 'full') lines.push(tr('receipt.statusReturned'));
  else if (sale.returnStatus === 'partial') lines.push(tr('receipt.statusPartial'));

  const items = Array.isArray(sale.items) ? sale.items : [];
  if (!compact) lines.push('--------------------------------');
  const shown = compact ? items.slice(0, maxItems) : items;
  for (const item of shown) {
    const factor = Number(item.unitFactor) || 1;
    const qty = factor > 1 ? `${round2(item.quantity / factor)} ${item.unitName}` : `${item.quantity}`;
    lines.push(`${item.name} x${qty} ${money(item.subtotal)}`);
  }
  if (items.length > shown.length) lines.push(tr('receipt.moreItems', { count: String(items.length - shown.length) }));
  if (!compact) lines.push('--------------------------------');

  if (Number(sale.discount) > 0) lines.push(tr('receipt.discount', { amount: money(sale.discount) }));
  if (!compact) {
    const taxLines = Array.isArray(sale.taxLines) ? sale.taxLines : [];
    if (taxLines.length) {
      for (const tl of taxLines) lines.push(`${tl.name} ${tl.rate}%: ${money(tl.amount)}`);
    } else if (Number(sale.tax) > 0) {
      lines.push(tr('receipt.tax', { amount: money(sale.tax) }));
    }
  }
  lines.push(tr('receipt.total', { amount: money(sale.grandTotal) }));
  const paid = amountPaid(sale);
  lines.push(tr('receipt.paid', { amount: money(paid) }));
  if (!compact) {
    for (const p of receiptPayments(sale)) {
      const status = p.status === 'pending' ? tr('receipt.pending') : p.status === 'refunded' ? tr('receipt.refunded') : '';
      lines.push(`  ${methodLabel(p.method, loc)}: ${money(p.amount)}${status}`);
    }
    if (Number(sale.change) > 0) lines.push(tr('receipt.change', { amount: money(sale.change) }));
  }
  if (Number(sale.balanceDue) > 0) lines.push(tr('receipt.balanceDue', { amount: money(sale.balanceDue) }));

  if (!compact) {
    lines.push('');
    lines.push(settings.receiptFooter ? String(settings.receiptFooter) : tr('receipt.thankYou'));
  } else {
    lines.push(tr('receipt.thankYou'));
  }
  return lines.join('\n');
};

/** Email subject for a receipt, in the pharmacy language. */
const buildReceiptSubject = ({ sale, pharmacy, locale } = {}) => {
  const loc = locale ? normalizeLocale(locale) : pharmacyLocale(pharmacy);
  return t(loc, 'receipt.subject', {
    number: sale?.invoiceNumber || '',
    pharmacy: pharmacy?.name || t(loc, 'receipt.pharmacy'),
  });
};

// ------------------------------------------------------------- validation

// Accepts local Ethiopian (09xxxxxxxx / 07xxxxxxxx) and international (+2519..., +44...) numbers.
// Returns the normalized number (digits, optional leading +) or null.
const normalizePhone = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^\+?[\d\s\-().]+$/.test(raw)) return null;
  const plus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const normalizeEmail = (value) => {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v.length > 254 || !EMAIL_RE.test(v)) return null;
  return v;
};

// ------------------------------------------------------------- rate limit

// In-memory sliding window per sale: max `limit` sends per `windowMs`.
const SEND_LIMIT = 5;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const sendLog = new Map(); // key -> [timestamps]

const checkSendRate = (key, { limit = SEND_LIMIT, windowMs = SEND_WINDOW_MS, now = Date.now() } = {}) => {
  const recent = (sendLog.get(key) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= limit) {
    sendLog.set(key, recent);
    const retryAfterMs = windowMs - (now - recent[0]);
    return { allowed: false, retryAfterMs };
  }
  recent.push(now);
  sendLog.set(key, recent);
  // Opportunistic cleanup so the map doesn't grow forever.
  if (sendLog.size > 5000) {
    for (const [k, list] of sendLog) {
      if (!list.some((ts) => now - ts < windowMs)) sendLog.delete(k);
    }
  }
  return { allowed: true, remaining: limit - recent.length };
};

const resetSendRate = () => sendLog.clear();

module.exports = {
  buildReceiptText,
  buildReceiptSubject,
  normalizePhone,
  normalizeEmail,
  checkSendRate,
  resetSendRate,
  methodLabel,
  SEND_LIMIT,
  SEND_WINDOW_MS,
};
