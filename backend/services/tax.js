// Tax calculation (#22). Owner: Insights agent.
//
// Contract (docs/AGENT_PLAN.md):
//   computeTax({ pharmacy, lines: [{ medicine, lineTotal }] })
//     -> { taxLines: [{ name, rate, amount }], taxTotal, lineTaxes: number[] }
//
// - `pharmacy.settings.tax` = { enabled, name, rate (percent, e.g. 15), inclusive, registrationNo }.
// - Exclusive pricing: tax = lineTotal * rate (added on top of the price).
// - Inclusive pricing: tax = lineTotal - lineTotal / (1 + rate) (already inside the price).
// - Lines whose medicine has `taxExempt: true` get 0.
// - Tax disabled (or rate 0): every amount is 0 and taxLines is empty.
// - Every per-line amount is rounded to 2 decimals; taxTotal is the rounded sum of lineTaxes.

const round2 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
};

// Normalized tax settings of a pharmacy (doc or plain object). Never throws.
const getTaxSettings = (pharmacy) => {
  const raw = (pharmacy && pharmacy.settings && pharmacy.settings.tax) || {};
  const rate = Number(raw.rate);
  return {
    enabled: Boolean(raw.enabled),
    name: (typeof raw.name === 'string' && raw.name.trim()) || 'VAT',
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    inclusive: Boolean(raw.inclusive),
    registrationNo: typeof raw.registrationNo === 'string' ? raw.registrationNo : '',
  };
};

const computeTax = ({ pharmacy, lines } = {}) => {
  const list = Array.isArray(lines) ? lines : [];
  const settings = getTaxSettings(pharmacy);

  if (!settings.enabled || settings.rate <= 0) {
    return { taxLines: [], taxTotal: 0, lineTaxes: list.map(() => 0) };
  }

  const r = settings.rate / 100;
  const lineTaxes = list.map((line) => {
    const total = Number(line && line.lineTotal);
    if (!Number.isFinite(total) || total <= 0) return 0;
    if (line.medicine && line.medicine.taxExempt) return 0;
    const tax = settings.inclusive ? total - total / (1 + r) : total * r;
    return round2(tax);
  });

  const taxTotal = round2(lineTaxes.reduce((sum, t) => sum + t, 0));
  const taxLines = taxTotal > 0 ? [{ name: settings.name, rate: settings.rate, amount: taxTotal }] : [];

  return { taxLines, taxTotal, lineTaxes };
};

module.exports = { computeTax, getTaxSettings, round2 };
