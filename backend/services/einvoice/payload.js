// Provider-agnostic fiscal invoice payload: builder + validation.
//
// NOTE: this is OUR internal snapshot format ('pharmacy-erp/einvoice@1'), not the
// Ministry of Revenues (MoR) wire format. A real provider adapter maps it to the
// official schema (see providers.js, `mor` adapter TODO block).
//
// Amounts follow the sale: items[].subtotal is the gross line (before the
// sale-level discount), items[].taxAmount is the tax on the discounted line and
// sale.grandTotal = subtotal - discount (+ tax when prices exclude tax).

const PAYLOAD_SCHEMA = 'pharmacy-erp/einvoice@1';
// TIN-like identifier: letters/digits/dash, 4-20 chars. Providers may be stricter.
const TIN_RE = /^[0-9A-Za-z-]{4,20}$/;

const round2 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
};

const str = (v) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());

// Splits `amount` across `weights` proportionally; the last share absorbs rounding.
const splitAmount = (amount, weights) => {
  const total = weights.reduce((s, w) => s + (Number(w) || 0), 0);
  if (!(amount > 0) || !(total > 0)) return weights.map(() => 0);
  let left = round2(amount);
  return weights.map((w, i) => {
    if (i === weights.length - 1) return round2(left);
    const share = round2((amount * (Number(w) || 0)) / total);
    left = round2(left - share);
    return share;
  });
};

// Whether the sale's prices already included tax (derived from its own totals).
const salePricesIncludeTax = (sale) => {
  const tax = round2(sale.tax);
  if (!(tax > 0)) return false;
  const net = round2((Number(sale.subtotal) || 0) - (Number(sale.discount) || 0));
  const grand = round2(sale.grandTotal);
  return Math.abs(grand - net) < 0.01 && Math.abs(grand - round2(net + tax)) >= 0.01;
};

const saleTaxRate = (sale, pharmacy) => {
  const fromSale = Array.isArray(sale.taxLines) && sale.taxLines[0] ? Number(sale.taxLines[0].rate) : NaN;
  if (Number.isFinite(fromSale) && fromSale > 0) return fromSale;
  const fromSettings = Number(pharmacy?.settings?.tax?.rate);
  return Number.isFinite(fromSettings) && fromSettings > 0 ? fromSettings : 0;
};

const sellerOf = (pharmacy) => ({
  tin: str(pharmacy.tin),
  vatRegNo: str(pharmacy.vatRegNo) || str(pharmacy.settings?.tax?.registrationNo),
  vatRegistered: Boolean(pharmacy.vatRegistered),
  name: str(pharmacy.name),
  address: str(pharmacy.address),
  phone: str(pharmacy.phone),
  licenseNo: str(pharmacy.licenseNo),
});

const buyerOf = (sale, customer) => ({
  tin: str(customer?.tin),
  legalName: str(customer?.legalName),
  name: str(customer?.name) || str(sale.customer?.name) || 'Walk-in Customer',
  phone: str(customer?.phone) || str(sale.customer?.phone),
});

// One fiscal line from a sale item, optionally scaled (credit notes: fraction returned).
const lineFromItem = ({ item, discountShare, rate, inclusive, fraction = 1, lineNo }) => {
  const gross = round2((Number(item.subtotal) || 0) * fraction);
  const discount = round2((Number(discountShare) || 0) * fraction);
  const net = round2(gross - discount);
  const taxAmount = round2((Number(item.taxAmount) || 0) * fraction);
  const taxableAmount = round2(inclusive ? net - taxAmount : net);
  const lineRate = taxAmount > 0 ? rate : 0;
  return {
    lineNo,
    medicineId: item.medicineId ? String(item.medicineId) : '',
    description: str(item.name),
    quantity: Math.round((Number(item.quantity) || 0) * fraction * 1000) / 1000,
    unit: str(item.unitName) || 'unit',
    unitPrice: round2(item.unitPrice),
    grossAmount: gross,
    discount,
    taxableAmount,
    taxCategory: lineRate > 0 ? 'standard' : 'exempt',
    taxRate: lineRate,
    taxAmount,
    lineTotal: round2(taxableAmount + taxAmount),
  };
};

const hasNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

// Credit note line from the amounts stored on the return item (returns since the per-line
// refund fix): lineTotal = what was paid for the returned units, so the credit note total
// equals Return.refundTotal + Return.insurerTotal.
const lineFromReturnItem = ({ item, ri, rate, inclusive, lineNo }) => {
  const lineTotal = round2(ri.grossAmount);
  const taxAmount = round2(ri.taxAmount || 0);
  const discount = round2(ri.discountAmount || 0);
  const taxableAmount = round2(lineTotal - taxAmount);
  const gross = round2((inclusive ? lineTotal : taxableAmount) + discount);
  const lineRate = taxAmount > 0 ? rate : 0;
  return {
    lineNo,
    medicineId: item.medicineId ? String(item.medicineId) : '',
    description: str(item.name),
    quantity: Number(ri.quantity) || 0,
    unit: str(item.unitName) || 'unit',
    unitPrice: round2(item.unitPrice),
    grossAmount: gross,
    discount,
    taxableAmount,
    taxCategory: lineRate > 0 ? 'standard' : 'exempt',
    taxRate: lineRate,
    taxAmount,
    lineTotal,
  };
};

const summarize = (lines) => {
  const byRate = new Map();
  lines.forEach((l) => {
    if (!(l.taxRate > 0)) return;
    const cur = byRate.get(l.taxRate) || { rate: l.taxRate, taxableAmount: 0, amount: 0 };
    cur.taxableAmount = round2(cur.taxableAmount + l.taxableAmount);
    cur.amount = round2(cur.amount + l.taxAmount);
    byRate.set(l.taxRate, cur);
  });
  return [...byRate.values()];
};

const sum = (lines, key) => round2(lines.reduce((s, l) => s + (Number(l[key]) || 0), 0));

const buildSalePayload = ({ pharmacy, sale, customer = null }) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const inclusive = salePricesIncludeTax(sale);
  const rate = saleTaxRate(sale, pharmacy);
  const taxName = (Array.isArray(sale.taxLines) && sale.taxLines[0]?.name) || pharmacy?.settings?.tax?.name || 'VAT';
  const discounts = splitAmount(Number(sale.discount) || 0, items.map((i) => Number(i.subtotal) || 0));
  const lines = items.map((item, i) =>
    lineFromItem({ item, discountShare: discounts[i], rate, inclusive, lineNo: i + 1 })
  );

  return {
    schema: PAYLOAD_SCHEMA,
    documentType: 'invoice',
    invoiceNumber: str(sale.invoiceNumber),
    issueDate: new Date(sale.offlineCreatedAt || sale.createdAt || Date.now()).toISOString(),
    currency: str(pharmacy?.settings?.currency) || 'ETB',
    pricesIncludeTax: inclusive,
    seller: sellerOf(pharmacy),
    buyer: buyerOf(sale, customer),
    lines,
    taxLines: summarize(lines).map((t) => ({ name: taxName, ...t })),
    totals: {
      grossAmount: round2(sale.subtotal),
      discount: round2(sale.discount),
      taxableAmount: sum(lines, 'taxableAmount'),
      taxTotal: round2(sale.tax),
      grandTotal: round2(sale.grandTotal),
    },
    payment: { method: str(sale.paymentMethod) || 'cash' },
  };
};

// Credit note for a return: lines are the returned share of the original sale lines.
const buildCreditNotePayload = ({ pharmacy, sale, ret, original = null, customer = null }) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const inclusive = salePricesIncludeTax(sale);
  const rate = saleTaxRate(sale, pharmacy);
  const taxName = (Array.isArray(sale.taxLines) && sale.taxLines[0]?.name) || pharmacy?.settings?.tax?.name || 'VAT';
  const discounts = splitAmount(Number(sale.discount) || 0, items.map((i) => Number(i.subtotal) || 0));

  const lines = [];
  (ret.items || []).forEach((ri) => {
    const idx = items.findIndex((si) => String(si._id) === String(ri.saleItemId));
    if (idx < 0) return;
    const item = items[idx];
    if (hasNum(ri.grossAmount)) {
      lines.push(lineFromReturnItem({ item, ri, rate, inclusive, lineNo: lines.length + 1 }));
      return;
    }
    // Older returns without stored amounts: returned share of the sale line
    const fraction = Number(item.quantity) > 0 ? Math.min(1, Number(ri.quantity) / Number(item.quantity)) : 0;
    lines.push(lineFromItem({ item, discountShare: discounts[idx], rate, inclusive, fraction, lineNo: lines.length + 1 }));
  });

  return {
    schema: PAYLOAD_SCHEMA,
    documentType: 'credit_note',
    invoiceNumber: str(ret.returnNumber),
    issueDate: new Date(ret.createdAt || Date.now()).toISOString(),
    currency: str(pharmacy?.settings?.currency) || 'ETB',
    pricesIncludeTax: inclusive,
    reason: str(ret.reason),
    originalInvoice: {
      invoiceNumber: str(sale.invoiceNumber),
      fiscalNumber: str(original?.fiscalNumber),
      irn: str(original?.irn),
      issueDate: new Date(sale.offlineCreatedAt || sale.createdAt || Date.now()).toISOString(),
    },
    seller: sellerOf(pharmacy),
    buyer: buyerOf(sale, customer),
    lines,
    taxLines: summarize(lines).map((t) => ({ name: taxName, ...t })),
    totals: {
      grossAmount: sum(lines, 'grossAmount'),
      discount: sum(lines, 'discount'),
      taxableAmount: sum(lines, 'taxableAmount'),
      taxTotal: sum(lines, 'taxAmount'),
      grandTotal: sum(lines, 'lineTotal'),
    },
    // grandTotal = refundTotal (patient) + insurerShare (taken off the insurance claim)
    refundTotal: round2(ret.refundTotal),
    insurerShare: round2(
      hasNum(ret.insurerTotal)
        ? ret.insurerTotal
        : (ret.items || []).reduce((s2, ri) => s2 + (Number(ri.insurerAmount) || 0), 0)
    ),
    payment: { method: str(ret.refundMethod) || 'cash' },
  };
};

// Returns a list of human-readable problems (empty = valid).
const validatePayload = (p) => {
  const errors = [];
  if (!p || typeof p !== 'object') return ['Payload is missing'];
  const near = (a, b, tol = 0.011) => Math.abs(round2(a) - round2(b)) <= tol;

  if (!p.seller || !p.seller.tin) errors.push('Seller TIN is missing (set it in the e-invoicing settings)');
  else if (!TIN_RE.test(p.seller.tin)) errors.push('Seller TIN has an invalid format');
  if (p.buyer && p.buyer.tin && !TIN_RE.test(p.buyer.tin)) errors.push('Buyer TIN has an invalid format');
  if (!p.invoiceNumber) errors.push('Invoice number is missing');
  if (!p.issueDate || Number.isNaN(new Date(p.issueDate).getTime())) errors.push('Invoice date is invalid');
  if (p.documentType === 'credit_note' && !p.originalInvoice?.invoiceNumber) {
    errors.push('Credit note must reference the original invoice');
  }

  const lines = Array.isArray(p.lines) ? p.lines : [];
  if (lines.length === 0) errors.push('Invoice has no lines');
  lines.forEach((l) => {
    const tag = `Line ${l.lineNo}`;
    const amounts = ['grossAmount', 'discount', 'taxableAmount', 'taxAmount', 'lineTotal', 'unitPrice'];
    if (!(Number(l.quantity) > 0)) errors.push(`${tag}: quantity must be positive`);
    if (amounts.some((k) => !Number.isFinite(Number(l[k])) || Number(l[k]) < 0)) {
      errors.push(`${tag}: amounts must be non-negative numbers`);
      return;
    }
    if (!near(l.lineTotal, l.taxableAmount + l.taxAmount)) errors.push(`${tag}: line total != taxable amount + tax`);
    if (!(l.taxRate > 0) && l.taxAmount > 0) errors.push(`${tag}: tax charged on an exempt line`);
    if (l.taxRate > 0) {
      // Tax is rounded per line (and split across batches): allow a few cents of drift.
      const expected = (l.taxableAmount * l.taxRate) / 100;
      if (!near(l.taxAmount, expected, Math.max(0.05, expected * 0.005))) {
        errors.push(`${tag}: tax amount does not match the ${l.taxRate}% rate`);
      }
    }
  });

  const t = p.totals || {};
  const lineTax = sum(lines, 'taxAmount');
  if (!near(t.grandTotal, sum(lines, 'lineTotal'), 0.011 * Math.max(1, lines.length))) {
    errors.push('Invoice total does not equal the sum of the lines');
  }
  if (!near(t.taxTotal, lineTax)) errors.push('Tax total does not equal the sum of the line taxes');
  const taxLines = Array.isArray(p.taxLines) ? p.taxLines : [];
  if (!near(sum(taxLines, 'amount'), lineTax)) errors.push('Tax summary does not equal the sum of the line taxes');

  return [...new Set(errors)];
};

module.exports = {
  PAYLOAD_SCHEMA,
  TIN_RE,
  round2,
  splitAmount,
  salePricesIncludeTax,
  buildSalePayload,
  buildCreditNotePayload,
  validatePayload,
};
