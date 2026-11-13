// Client-side mirrors of backend catalog rules (services/catalog.js).

// Margin as a share of the selling price. Returns 'below_cost' | 'below_min_margin' | null.
export const marginWarningFor = ({ price, costPrice, minMarginPercent }) => {
  const p = Number(price) || 0;
  const c = Number(costPrice) || 0;
  if (c <= 0) return null;
  if (p < c) return 'below_cost';
  if (minMarginPercent !== null && minMarginPercent !== undefined && minMarginPercent !== '') {
    const min = Number(minMarginPercent);
    if (Number.isFinite(min) && p > 0 && ((p - c) / p) * 100 < min) return 'below_min_margin';
  }
  return null;
};

// Pack units: name required/unique (and != base unit), factor whole number >= 2,
// price >= 0 or empty. Returns an error string or ''.
export const validatePackUnits = (units, baseUnit = 'unit') => {
  const seen = new Set([String(baseUnit || 'unit').trim().toLowerCase()]);
  for (const u of units) {
    const name = String(u.name || '').trim();
    if (!name) return 'Every pack unit needs a name.';
    if (seen.has(name.toLowerCase())) return `Pack unit "${name}" is duplicated or equals the base unit.`;
    seen.add(name.toLowerCase());
    const f = Number(u.factor);
    if (!Number.isInteger(f) || f < 2) return `Pack unit "${name}": factor must be a whole number of at least 2.`;
    if (u.price !== '' && u.price !== null && u.price !== undefined && !(Number(u.price) >= 0)) {
      return `Pack unit "${name}": price must be 0 or more.`;
    }
  }
  return '';
};

export const MOVEMENT_TYPE_LABELS = {
  sale: 'Sale',
  purchase_receive: 'PO receive',
  stock_in: 'Stock in',
  adjust_damaged: 'Damaged',
  adjust_expired: 'Expired write-off',
  correction: 'Correction',
  delete: 'Batch deleted',
  return: 'Return',
  void: 'Void',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  stock_take: 'Stock take',
  expire: 'Expired',
  unit_conversion: 'Unit conversion',
};
