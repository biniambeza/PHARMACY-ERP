// Refund estimate for the return dialog. Mirrors backend/controllers/returnController.js
// (saleLineAmounts / returnedQuantities / takeLine): the server computes the exact amounts.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const ZERO = { gross: 0, tax: 0, discount: 0, insurer: 0 };

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
const pricesIncludeTax = (sale) => {
  const tax = round2(sale.tax);
  if (!(tax > 0)) return false;
  const net = round2((Number(sale.subtotal) || 0) - (Number(sale.discount) || 0));
  const grand = round2(sale.grandTotal);
  return Math.abs(grand - net) < 0.01 && Math.abs(grand - round2(net + tax)) >= 0.01;
};

/**
 * What each sale line actually paid (sums to sale.grandTotal):
 * Map saleItemId -> { gross, tax, discount, insurer }.
 *   gross = line subtotal - its share of the sale discount + its tax when prices exclude tax
 */
export const saleLineAmounts = (sale) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const subtotals = items.map((i) => Number(i.subtotal) || 0);
  const discounts = splitAmount(Number(sale.discount) || 0, subtotals);
  let taxes = items.map((i) => round2(i.taxAmount));
  const saleTax = round2(sale.tax);
  if (Math.abs(taxes.reduce((s, x) => s + x, 0) - saleTax) > 0.011) taxes = splitAmount(saleTax, subtotals);
  const inclusive = pricesIncludeTax(sale);
  let gross = items.map((i, idx) => round2(subtotals[idx] - discounts[idx] + (inclusive ? 0 : taxes[idx])));
  // Anything that does not add up to the grand total (legacy data) is spread by line value
  const diff = round2((Number(sale.grandTotal) || 0) - gross.reduce((s, g) => s + g, 0));
  if (Math.abs(diff) > 0.011) {
    const extra = splitAmount(Math.abs(diff), gross.map((g) => Math.max(0, g)));
    gross = gross.map((g, idx) => round2(Math.max(0, g + Math.sign(diff) * extra[idx])));
  }
  const map = new Map();
  items.forEach((i, idx) => {
    map.set(String(i._id), {
      gross: gross[idx],
      tax: Math.min(taxes[idx], gross[idx]),
      discount: discounts[idx],
      insurer: sale.insurance ? Math.min(round2(i.insuranceAmount), gross[idx]) : 0,
    });
  });
  return map;
};

/**
 * What previous returns of the sale already took back:
 * { qty: { saleItemId: n }, amounts: Map saleItemId -> { gross, tax, discount, insurer }, refunded, creditReversed }
 */
export const previousReturnAmounts = (sale, returns, lineAmounts) => {
  const saleItems = new Map((sale.items || []).map((i) => [String(i._id), i]));
  const legacyFactor = sale.subtotal > 0 ? sale.grandTotal / sale.subtotal : 0;
  const qty = {};
  const amounts = new Map();
  let refunded = 0;
  let creditReversed = 0;
  (returns || []).forEach((r) => {
    refunded += Number(r.refundTotal) || 0;
    creditReversed += Number(r.creditReversed) || 0;
    (r.items || []).forEach((it) => {
      const key = String(it.saleItemId);
      qty[key] = (qty[key] || 0) + (Number(it.quantity) || 0);
      const si = saleItems.get(key);
      const line = lineAmounts.get(key);
      const frac = si && si.quantity ? Math.min(1, it.quantity / si.quantity) : 0;
      const prev = amounts.get(key) || { ...ZERO };
      const insurer = isNum(it.insurerAmount) ? Number(it.insurerAmount) : line ? line.insurer * frac : 0;
      prev.insurer += insurer;
      prev.gross += isNum(it.grossAmount)
        ? Number(it.grossAmount)
        : Math.max((it.refundAmount || 0) + insurer, si ? it.quantity * si.unitPrice * legacyFactor : 0);
      prev.tax += isNum(it.taxAmount) ? Number(it.taxAmount) : line ? line.tax * frac : 0;
      prev.discount += isNum(it.discountAmount) ? Number(it.discountAmount) : line ? line.discount * frac : 0;
      amounts.set(key, prev);
    });
  });
  return { qty, amounts, refunded: round2(refunded), creditReversed: round2(creditReversed) };
};

// Part of the sale that was put on the customer's credit account.
const creditPortion = (sale) => {
  if (!sale.customerId) return 0;
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  if (payments.length > 0) {
    return round2(
      payments
        .filter((p) => p.method === 'credit' && p.status !== 'failed' && p.status !== 'refunded')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    );
  }
  return sale.paymentMethod === 'credit' ? round2(sale.grandTotal) : 0;
};

/**
 * Estimated refund for the selected quantities ([{ item, quantity }]): per line what it paid
 * (discount share, its own tax) pro rata, the last units of a line take exactly what is left,
 * the insurer's share is never refunded to the patient, and on a credit sale the refund first
 * reduces what the customer owes.
 * Returns { refund, insurer, credit } where `credit` is the part of `refund` taken off the balance.
 */
export const estimateRefund = (sale, previous, lineAmounts, selected) => {
  let refund = 0;
  let insurer = 0;
  selected.forEach(({ item, quantity }) => {
    const key = String(item._id);
    const line = lineAmounts.get(key) || ZERO;
    const done = previous.amounts.get(key) || ZERO;
    const last = (previous.qty[key] || 0) + quantity >= item.quantity;
    const part = (field) => {
      const left = round2(Math.max(0, line[field] - done[field]));
      return last ? left : Math.min(left, round2((line[field] * quantity) / item.quantity));
    };
    const gross = part('gross');
    const ins = Math.min(part('insurer'), gross);
    insurer += ins;
    refund += round2(Math.max(0, gross - ins));
  });
  const insurerTotal = sale.insurance
    ? (sale.items || []).reduce((s, si) => s + (Number(si.insuranceAmount) || 0), 0)
    : 0;
  const patientPaid = round2(Math.max(0, (Number(sale.grandTotal) || 0) - insurerTotal));
  refund = Math.min(round2(refund), round2(Math.max(0, patientPaid - previous.refunded)));
  const creditLeft = round2(Math.max(0, creditPortion(sale) - previous.creditReversed));
  return { refund, insurer: round2(insurer), credit: round2(Math.min(refund, creditLeft)) };
};
