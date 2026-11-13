// Pure helpers for the POS (pricing, tax preview, payments, held sales).
// Tax/discount maths mirror backend/services/sales.js + services/tax.js so the screen
// shows what the server will charge.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const EPS = 0.005;

export const inputCls =
  'w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';
export const cardCls =
  'bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs';
export const sectionCls =
  'bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 rounded-xl p-3 space-y-2';
export const labelCls = 'text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider';

// Units a medicine can be sold in: base unit first, then pack units.
export const unitsOf = (med) => {
  const base = { name: med.baseUnit || 'unit', factor: 1, price: round2(Number(med.price) || 0) };
  const packs = (med.packUnits || [])
    .filter((p) => p && p.name && Number(p.factor) >= 1)
    .map((p) => ({
      name: p.name,
      factor: Number(p.factor),
      price: round2(p.price !== null && p.price !== undefined ? Number(p.price) : Number(med.price) * Number(p.factor)),
    }));
  return [base, ...packs];
};

export const findUnit = (med, unitName) => {
  const units = unitsOf(med);
  if (!unitName) return units[0];
  return units.find((u) => u.name.toLowerCase() === String(unitName).toLowerCase()) || units[0];
};

// Medicine (+ unit) matching a scanned code in the local catalog.
export const matchCode = (medicines, code) => {
  const c = String(code || '').trim();
  if (!c) return null;
  const lc = c.toLowerCase();
  for (const m of medicines) {
    if (m.barcode && m.barcode === c) return { medicine: m, unit: unitsOf(m)[0] };
    const pack = (m.packUnits || []).find((p) => p.barcode && p.barcode === c);
    if (pack) return { medicine: m, unit: findUnit(m, pack.name) };
  }
  const bySku = medicines.find((m) => m.sku && String(m.sku).toLowerCase() === lc);
  return bySku ? { medicine: bySku, unit: unitsOf(bySku)[0] } : null;
};

// Base units of a medicine already in the cart (all lines / units), optionally excluding one line.
export const baseQtyInCart = (cart, medicineId, exceptKey) =>
  cart
    .filter((l) => l.medicineId === medicineId && l.key !== exceptKey)
    .reduce((s, l) => s + l.quantity * l.unit.factor, 0);

const splitAmount = (total, weights) => {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  let left = round2(total);
  return weights.map((w, i) => {
    if (i === weights.length - 1) return round2(left);
    const part = round2((total * w) / sum);
    left = round2(left - part);
    return part;
  });
};

export const taxSettingsOf = (pharmacy) => {
  const raw = pharmacy?.settings?.tax || {};
  const rate = Number(raw.rate);
  return {
    enabled: Boolean(raw.enabled),
    name: raw.name || 'VAT',
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    inclusive: Boolean(raw.inclusive),
  };
};

export const maxDiscountOf = (pharmacy, subtotal) => {
  const pct = Number(pharmacy?.settings?.maxDiscountPercent);
  const capPct = Number.isFinite(pct) && pct < 100 ? pct : 100;
  return { pct: capPct, amount: round2((subtotal * capPct) / 100) };
};

// Totals for the cart: { subtotal, discount, tax, grandTotal, taxName, taxRate, inclusive, maxDiscount }
export const computeTotals = (cart, discountInput, pharmacy) => {
  const lineTotals = cart.map((l) => round2(l.quantity * l.unit.price));
  const subtotal = round2(lineTotals.reduce((s, v) => s + v, 0));
  const maxDiscount = maxDiscountOf(pharmacy, subtotal);
  const discount = round2(Math.min(Math.max(0, Number(discountInput) || 0), maxDiscount.amount, subtotal));
  const tax = taxSettingsOf(pharmacy);
  let taxTotal = 0;
  if (tax.enabled && tax.rate > 0) {
    const shares = splitAmount(discount, lineTotals);
    const r = tax.rate / 100;
    taxTotal = round2(
      cart.reduce((s, l, i) => {
        if (l.taxExempt) return s;
        const t = lineTotals[i] - shares[i];
        if (t <= 0) return s;
        return s + round2(tax.inclusive ? t - t / (1 + r) : t * r);
      }, 0)
    );
  }
  const grandTotal = round2(Math.max(0, subtotal - discount + (tax.inclusive ? 0 : taxTotal)));
  return {
    subtotal,
    discount,
    tax: taxTotal,
    grandTotal,
    taxName: tax.name,
    taxRate: tax.rate,
    taxEnabled: tax.enabled && tax.rate > 0,
    inclusive: tax.inclusive,
    maxDiscount,
  };
};

// Amount of each cart line after its discount share and (exclusive) tax, the way the server
// computes the insurer share: [{ medicineId, amount }]. Used for the insurance coverage preview.
export const lineGrossAmounts = (cart, discount, pharmacy) => {
  const lineTotals = cart.map((l) => round2(l.quantity * l.unit.price));
  const shares = splitAmount(Number(discount) || 0, lineTotals);
  const tax = taxSettingsOf(pharmacy);
  const r = tax.rate / 100;
  return cart.map((l, i) => {
    const net = round2(lineTotals[i] - shares[i]);
    const lineTax = tax.enabled && tax.rate > 0 && !tax.inclusive && !l.taxExempt && net > 0 ? round2(net * r) : 0;
    return { medicineId: l.medicineId, amount: round2(net + lineTax) };
  });
};

// Payment rows: [{ id, method, amount, reference, provider, intentId, intentStatus }]
// Insurance rows also carry { schemeId, member, preview } (amount = insurer share from the preview).
export const paymentStatus = (payments, grandTotal) => {
  const amounts = payments.map((p) => round2(Number(p.amount) || 0));
  const total = round2(amounts.reduce((s, v) => s + v, 0));
  const cash = round2(payments.reduce((s, p, i) => s + (p.method === 'cash' ? amounts[i] : 0), 0));
  const excess = round2(total - grandTotal);
  const change = excess > EPS && cash >= excess - EPS ? excess : 0;
  const remaining = round2(Math.max(0, grandTotal - total));
  const invalidExcess = excess > EPS && cash < excess - EPS;
  const credit = round2(payments.reduce((s, p, i) => s + (p.method === 'credit' ? amounts[i] : 0), 0));
  return { total, cash, change, remaining, invalidExcess, credit, covered: remaining <= EPS && !invalidExcess };
};

export const METHOD_LABELS = { cash: 'Cash', card: 'Card', mobile_money: 'Mobile money', credit: 'Credit', insurance: 'Insurance' };

// ---------- Held / parked sales (localStorage, per pharmacy + user) ----------

const heldKey = (pharmacyId, userId) => `pos.held.${pharmacyId || 'none'}.${userId || 'none'}`;

export const loadHeld = (pharmacyId, userId) => {
  try {
    const raw = localStorage.getItem(heldKey(pharmacyId, userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const saveHeld = (pharmacyId, userId, list) => {
  try {
    localStorage.setItem(heldKey(pharmacyId, userId), JSON.stringify(list.slice(0, 30)));
  } catch {
    // storage full / unavailable
  }
};

// Last known shift (so the POS can keep selling offline)
const shiftKey = (pharmacyId, userId) => `pos.shift.${pharmacyId || 'none'}.${userId || 'none'}`;
export const cacheShift = (pharmacyId, userId, data) => {
  try {
    localStorage.setItem(shiftKey(pharmacyId, userId), JSON.stringify(data));
  } catch {
    // ignore
  }
};
export const loadCachedShift = (pharmacyId, userId) => {
  try {
    const raw = localStorage.getItem(shiftKey(pharmacyId, userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const errMsg = (err, fallback = 'Something went wrong') => err?.response?.data?.message || err?.message || fallback;

let rowSeq = 0;
// Payment row of the POS payment panel
export const newPaymentRow = (method = 'cash', amount = '') => ({
  id: `p${Date.now().toString(36)}${(rowSeq += 1)}`,
  method,
  amount: amount === '' ? '' : String(amount),
  reference: '',
  provider: '',
  phone: '',
  intentId: null,
  intentStatus: null,
  error: '',
  // insurance rows
  schemeId: '',
  member: null,
  preview: null,
});

