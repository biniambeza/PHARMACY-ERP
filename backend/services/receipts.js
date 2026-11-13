// Plain-text receipts for digital delivery (SMS / email / copy & share).
// buildReceiptText({ sale, pharmacy, compact? }) -> string
const METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  mobile_money: 'Mobile money',
  credit: 'Credit',
  store_credit: 'Store credit',
  insurance: 'Insurance',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const fmtMoney = (amount, currency = 'ETB') => {
  const value = round2(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${value}` : value;
};

const methodLabel = (m) => METHOD_LABELS[m] || String(m || 'other').replace(/_/g, ' ');

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
 */
const buildReceiptText = ({ sale, pharmacy, compact = false, maxItems = 5 } = {}) => {
  if (!sale) return '';
  const settings = (pharmacy && pharmacy.settings) || {};
  const currency = settings.currency || 'ETB';
  const money = (v) => fmtMoney(v, currency);
  const lines = [];

  lines.push(pharmacy?.name || 'Pharmacy');
  if (!compact) {
    if (pharmacy?.address) lines.push(pharmacy.address);
    if (pharmacy?.phone) lines.push(`Tel: ${pharmacy.phone}`);
    const tin = pharmacy?.tin || settings.tax?.registrationNo;
    if (tin) lines.push(`TIN: ${tin}`);
  }
  lines.push(`Invoice: ${sale.invoiceNumber}`);
  lines.push(`Date: ${fmtDate(sale.offlineCreatedAt || sale.createdAt)}`);
  if (sale.voided) lines.push('Status: VOIDED');
  else if (sale.returnStatus === 'full') lines.push('Status: RETURNED');
  else if (sale.returnStatus === 'partial') lines.push('Status: PARTIALLY RETURNED');

  const items = Array.isArray(sale.items) ? sale.items : [];
  if (!compact) lines.push('--------------------------------');
  const shown = compact ? items.slice(0, maxItems) : items;
  for (const item of shown) {
    const factor = Number(item.unitFactor) || 1;
    const qty = factor > 1 ? `${round2(item.quantity / factor)} ${item.unitName}` : `${item.quantity}`;
    lines.push(`${item.name} x${qty} ${money(item.subtotal)}`);
  }
  if (items.length > shown.length) lines.push(`+${items.length - shown.length} more item(s)`);
  if (!compact) lines.push('--------------------------------');

  if (Number(sale.discount) > 0) lines.push(`Discount: -${money(sale.discount)}`);
  if (!compact) {
    const taxLines = Array.isArray(sale.taxLines) ? sale.taxLines : [];
    if (taxLines.length) {
      for (const tl of taxLines) lines.push(`${tl.name} ${tl.rate}%: ${money(tl.amount)}`);
    } else if (Number(sale.tax) > 0) {
      lines.push(`Tax: ${money(sale.tax)}`);
    }
  }
  lines.push(`Total: ${money(sale.grandTotal)}`);
  const paid = amountPaid(sale);
  lines.push(`Paid: ${money(paid)}`);
  if (!compact) {
    for (const p of receiptPayments(sale)) {
      const status = p.status === 'pending' ? ' (pending)' : p.status === 'refunded' ? ' (refunded)' : '';
      lines.push(`  ${methodLabel(p.method)}: ${money(p.amount)}${status}`);
    }
    if (Number(sale.change) > 0) lines.push(`Change: ${money(sale.change)}`);
  }
  if (Number(sale.balanceDue) > 0) lines.push(`Balance due: ${money(sale.balanceDue)}`);

  if (!compact) {
    lines.push('');
    lines.push(settings.receiptFooter ? String(settings.receiptFooter) : 'Thank you!');
  } else {
    lines.push('Thank you!');
  }
  return lines.join('\n');
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
  normalizePhone,
  normalizeEmail,
  checkSendRate,
  resetSendRate,
  methodLabel,
  SEND_LIMIT,
  SEND_WINDOW_MS,
};
