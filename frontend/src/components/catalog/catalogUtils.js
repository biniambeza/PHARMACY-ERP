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
// Pass i18next `t` to get translated messages (medicines:packs.*); English otherwise.
export const validatePackUnits = (units, baseUnit = 'unit', t = null) => {
  const msg = (key, fallback, params) => (t ? t(`medicines:packs.${key}`, params) : fallback);
  const seen = new Set([String(baseUnit || 'unit').trim().toLowerCase()]);
  for (const u of units) {
    const name = String(u.name || '').trim();
    if (!name) return msg('errName', 'Every pack unit needs a name.');
    if (seen.has(name.toLowerCase())) return msg('errDuplicate', `Pack unit "${name}" is duplicated or equals the base unit.`, { name });
    seen.add(name.toLowerCase());
    const f = Number(u.factor);
    if (!Number.isInteger(f) || f < 2) return msg('errFactor', `Pack unit "${name}": factor must be a whole number of at least 2.`, { name });
    if (u.price !== '' && u.price !== null && u.price !== undefined && !(Number(u.price) >= 0)) {
      return msg('errPrice', `Pack unit "${name}": price must be 0 or more.`, { name });
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
