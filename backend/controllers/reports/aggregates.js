// Shared report aggregation building blocks (sales, returns, period summaries, trends).
const mongoose = require('mongoose');
const Sale = require('../../models/Sale');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const { DAY_MS, round2, getLocalDateString, getLocalDayName, getLocalMonthDay, localDayExpr } = require('./helpers');

// ---------------------------------------------------------------------------
// Shared aggregation pieces
// ---------------------------------------------------------------------------

// Non-voided sales of the tenant, optionally inside [from, to).
const saleMatch = (pharmacyId, from, to) => {
  const match = { pharmacyId, voided: { $ne: true } };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lt = to;
  }
  return match;
};

// Unwinds sale items and adds (no lookups):
//   _lineNet:  item subtotal minus its share of the sale discount and minus its own tax when
//              prices include tax (per-line revenue sums to grandTotal - tax). Legacy sales
//              whose tax was typed in for the whole sale spread it by subtotal.
//   _lineTax:  tax of the line (items.taxAmount; legacy: share of the sale tax)
const lineAmountStages = () => [
  {
    $addFields: {
      _itemTaxSum: { $sum: { $ifNull: ['$items.taxAmount', []] } },
      _netBase: { $subtract: [{ $ifNull: ['$subtotal', 0] }, { $ifNull: ['$discount', 0] }] },
    },
  },
  {
    $addFields: {
      _itemTaxOk: { $lte: [{ $abs: { $subtract: ['$_itemTaxSum', { $ifNull: ['$tax', 0] }] } }, 0.011] },
      _inclusive: {
        $and: [
          { $gt: [{ $ifNull: ['$tax', 0] }, 0] },
          { $lt: [{ $abs: { $subtract: [{ $ifNull: ['$grandTotal', 0] }, '$_netBase'] } }, 0.01] },
          {
            $gte: [
              { $abs: { $subtract: [{ $ifNull: ['$grandTotal', 0] }, { $add: ['$_netBase', { $ifNull: ['$tax', 0] }] }] } },
              0.01,
            ],
          },
        ],
      },
      _discFactor: {
        $cond: [
          { $gt: [{ $ifNull: ['$subtotal', 0] }, 0] },
          { $divide: [{ $ifNull: ['$discount', 0] }, '$subtotal'] },
          0,
        ],
      },
      _netFactor: {
        $cond: [
          { $gt: [{ $ifNull: ['$subtotal', 0] }, 0] },
          {
            $divide: [
              { $subtract: [{ $ifNull: ['$grandTotal', 0] }, { $ifNull: ['$tax', 0] }] },
              '$subtotal',
            ],
          },
          1,
        ],
      },
    },
  },
  { $unwind: '$items' },
  {
    $addFields: {
      _lineTax: {
        $cond: [
          '$_itemTaxOk',
          { $ifNull: ['$items.taxAmount', 0] },
          {
            $cond: [
              { $gt: [{ $ifNull: ['$subtotal', 0] }, 0] },
              { $divide: [{ $multiply: [{ $ifNull: ['$items.subtotal', 0] }, { $ifNull: ['$tax', 0] }] }, '$subtotal'] },
              0,
            ],
          },
        ],
      },
      _lineNet: {
        $cond: [
          '$_itemTaxOk',
          {
            $subtract: [
              { $multiply: [{ $ifNull: ['$items.subtotal', 0] }, { $subtract: [1, '$_discFactor'] }] },
              { $cond: ['$_inclusive', { $ifNull: ['$items.taxAmount', 0] }, 0] },
            ],
          },
          { $multiply: [{ $ifNull: ['$items.subtotal', 0] }, '$_netFactor'] },
        ],
      },
    },
  },
];

// lineAmountStages() plus cost:
//   _unitCost: items.costPrice (recorded at sale) || batch purchasePrice || medicine costPrice || 0
//   _lineCost: quantity (base units) * _unitCost
//   _med:      [{ name, category, costPrice }]
const itemCostStages = () => [
  ...lineAmountStages(),
  {
    $lookup: {
      from: StockBatch.collection.name,
      localField: 'items.batchId',
      foreignField: '_id',
      pipeline: [{ $project: { purchasePrice: 1 } }],
      as: '_batch',
    },
  },
  {
    $lookup: {
      from: Medicine.collection.name,
      localField: 'items.medicineId',
      foreignField: '_id',
      pipeline: [{ $project: { name: 1, category: 1, costPrice: 1 } }],
      as: '_med',
    },
  },
  {
    $addFields: {
      _unitCost: {
        $ifNull: ['$items.costPrice', { $first: '$_batch.purchasePrice' }, { $first: '$_med.costPrice' }, 0],
      },
    },
  },
  { $addFields: { _lineCost: { $multiply: [{ $ifNull: ['$items.quantity', 0] }, '$_unitCost'] } } },
];

// Return model is optional (built by the Returns agent).
const getReturnModel = () => {
  if (mongoose.models.Return) return mongoose.models.Return;
  try {
    return require('../../models/Return');
  } catch {
    return null;
  }
};

const EMPTY_RETURNS = () => ({
  refunds: 0,
  count: 0,
  restockedCost: 0,
  returnedGross: 0,
  returnedTax: 0,
  returnedNet: 0,
  insurerReturned: 0,
  byMedicine: new Map(),
  bySaleStaff: new Map(),
  bySaleShift: new Map(),
});

const num = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null);

// One row per returned item of non-voided sales processed in [from, to), with:
//   gross   = value of the returned units as paid (after discount, incl. tax) - incl. the insurer share
//   tax     = tax contained in gross;  net = gross - tax
//   insurer = insurer share of gross (insurance sales); refund = patient refund
// Returns since the per-line refund fix store these per item; older returns fall back to the
// old proportional figures (refundAmount + insurer share, sale item tax * returned fraction).
const loadReturnLines = async (pharmacyId, from, to) => {
  const Return = getReturnModel();
  if (!Return) return { returns: [], lines: [] };

  const match = { pharmacyId };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lt = to;
  }
  const returns = await Return.find(match)
    .select('saleId createdAt refundTotal items')
    .lean();
  if (returns.length === 0) return { returns: [], lines: [] };

  const saleIds = [...new Set(returns.map((r) => String(r.saleId)))];
  const sales = await Sale.find({ _id: { $in: saleIds }, pharmacyId })
    .select('voided items staffId pharmacistId shiftId taxLines insurance.schemeId')
    .lean();
  const saleById = new Map(sales.map((s) => [String(s._id), s]));

  const kept = returns.filter((r) => {
    const s = saleById.get(String(r.saleId));
    return !(s && s.voided);
  });

  const batchIds = new Set();
  const medIds = new Set();
  kept.forEach((r) => (r.items || []).forEach((it) => {
    if (it.batchId) batchIds.add(String(it.batchId));
    if (it.medicineId) medIds.add(String(it.medicineId));
  }));
  const [batches, meds] = await Promise.all([
    batchIds.size ? StockBatch.find({ _id: { $in: [...batchIds] } }).select('purchasePrice').lean() : [],
    medIds.size ? Medicine.find({ _id: { $in: [...medIds] } }).select('name category costPrice').lean() : [],
  ]);
  const batchById = new Map(batches.map((b) => [String(b._id), b]));
  const medById = new Map(meds.map((m) => [String(m._id), m]));

  const lines = [];
  kept.forEach((r) => {
    const sale = saleById.get(String(r.saleId)) || null;
    const saleItems = new Map(((sale && sale.items) || []).map((i) => [String(i._id), i]));
    const taxLine = (sale && Array.isArray(sale.taxLines) && sale.taxLines[0]) || null;
    (r.items || []).forEach((it) => {
      const si = saleItems.get(String(it.saleItemId)) || null;
      const frac = si && si.quantity ? Math.min(1, (it.quantity || 0) / si.quantity) : 0;
      const insurer = num(it.insurerAmount) ?? (sale && sale.insurance ? (Number(si?.insuranceAmount) || 0) * frac : 0);
      const gross = num(it.grossAmount) ?? (Number(it.refundAmount) || 0) + insurer;
      const tax = num(it.taxAmount) ?? (Number(si?.taxAmount) || 0) * frac;
      const net = num(it.netAmount) ?? gross - tax;
      const med = medById.get(String(it.medicineId));
      const batch = batchById.get(String(it.batchId));
      const unitCost = num(si?.costPrice) ?? num(batch?.purchasePrice) ?? num(med?.costPrice) ?? 0;
      lines.push({
        returnId: r._id,
        createdAt: r.createdAt,
        saleId: r.saleId,
        staffId: sale ? sale.staffId || sale.pharmacistId : null,
        shiftId: sale ? sale.shiftId || null : null,
        medicineId: it.medicineId,
        name: med?.name || it.name,
        category: med?.category || 'Uncategorized',
        quantity: it.quantity || 0,
        restocked: it.restocked === true,
        restockedCost: it.restocked === true ? (it.quantity || 0) * unitCost : 0,
        refund: Number(it.refundAmount) || 0,
        gross,
        tax,
        net,
        insurer,
        taxName: taxLine?.name || 'VAT',
        taxRate: Number(taxLine?.rate) || 0,
      });
    });
  });
  return { returns: kept, lines };
};

// Returns of non-voided sales processed in [from, to). Restocked items give their cost back
// (they are inventory again); discarded items stay a cost.
//   refunds         = patient refunds (Return.refundTotal)
//   returnedGross   = value taken back incl. tax and the insurer share (comes off revenue)
//   returnedTax     = tax taken back;  returnedNet = returnedGross - returnedTax
//   insurerReturned = insurer share taken back (comes off the claim)
const getReturnTotals = async (pharmacyId, from, to) => {
  const { returns, lines } = await loadReturnLines(pharmacyId, from, to);
  if (returns.length === 0) return EMPTY_RETURNS();
  const out = EMPTY_RETURNS();

  const add = (map, key, ret, l) => {
    const e = map.get(key) || { refunds: 0, gross: 0, tax: 0, net: 0, insurer: 0, count: 0, _ids: new Set() };
    if (ret && !e._ids.has(String(ret._id))) {
      e._ids.add(String(ret._id));
      e.count += 1;
      e.refunds += Number(ret.refundTotal) || 0;
    }
    if (l) {
      e.gross += l.gross;
      e.tax += l.tax;
      e.net += l.net;
      e.insurer += l.insurer;
    }
    map.set(key, e);
  };

  const retById = new Map(returns.map((r) => [String(r._id), r]));
  returns.forEach((r) => {
    out.refunds += Number(r.refundTotal) || 0;
    out.count += 1;
  });
  lines.forEach((l) => {
    const ret = retById.get(String(l.returnId));
    out.returnedGross += l.gross;
    out.returnedTax += l.tax;
    out.returnedNet += l.net;
    out.insurerReturned += l.insurer;
    out.restockedCost += l.restockedCost;
    add(out.bySaleStaff, String(l.staffId), ret, l);
    add(out.bySaleShift, String(l.shiftId), ret, l);

    const key = String(l.medicineId);
    const m = out.byMedicine.get(key) || {
      _id: l.medicineId, name: l.name, category: l.category, quantity: 0, refund: 0, gross: 0, tax: 0, net: 0, insurer: 0, restockedCost: 0,
    };
    m.quantity += l.quantity;
    m.refund += l.refund;
    m.gross += l.gross;
    m.tax += l.tax;
    m.net += l.net;
    m.insurer += l.insurer;
    m.restockedCost += l.restockedCost;
    out.byMedicine.set(key, m);
  });
  [out.bySaleStaff, out.bySaleShift].forEach((map) => map.forEach((e) => delete e._ids));
  return out;
};

// Sales totals (non-voided) for [from, to): gross receipts, tax, discount,
// order count and cost of goods sold using actual costs.
const getSaleTotals = async (pharmacyId, from, to) => {
  const [facet] = await Sale.aggregate([
    { $match: saleMatch(pharmacyId, from, to) },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              grossSales: { $sum: '$grandTotal' },
              tax: { $sum: { $ifNull: ['$tax', 0] } },
              discount: { $sum: { $ifNull: ['$discount', 0] } },
              balanceDue: { $sum: { $ifNull: ['$balanceDue', 0] } },
              orders: { $sum: 1 },
            },
          },
        ],
        cogs: [
          ...itemCostStages(),
          { $group: { _id: null, cogs: { $sum: '$_lineCost' }, units: { $sum: '$items.quantity' } } },
        ],
      },
    },
  ]).option({ allowDiskUse: true });
  const t = facet?.totals?.[0] || {};
  const c = facet?.cogs?.[0] || {};
  return {
    grossSales: t.grossSales || 0,
    tax: t.tax || 0,
    discount: t.discount || 0,
    balanceDue: t.balanceDue || 0,
    orders: t.orders || 0,
    cogs: c.cogs || 0,
    units: c.units || 0,
  };
};

// Full financial summary of a window, net of voids and returns (by return date).
// Sales count in full (patient + insurer share); returns take back their full value too.
//   grossSales  = sales receipts incl. tax and insurer share
//   refunds     = value of returned goods incl. tax and insurer share (returnedGross)
//   revenue     = grossSales - refunds
//   tax         = sales tax - tax on returned goods
//   netRevenue  = revenue - tax (= sales net of tax - returns net of tax)
//   cogs        = cost of items sold - cost of items restocked by returns
//   grossProfit = netRevenue - cogs
const getPeriodSummary = async (pharmacyId, from, to) => {
  const [sales, returns] = await Promise.all([
    getSaleTotals(pharmacyId, from, to),
    getReturnTotals(pharmacyId, from, to),
  ]);
  const revenue = sales.grossSales - returns.returnedGross;
  const tax = sales.tax - returns.returnedTax;
  const netRevenue = revenue - tax;
  const cogs = Math.max(0, sales.cogs - returns.restockedCost);
  const grossProfit = netRevenue - cogs;
  return {
    grossSales: round2(sales.grossSales),
    refunds: round2(returns.returnedGross),
    refundsNet: round2(returns.returnedNet),
    refundedTax: round2(returns.returnedTax),
    // Paid back to patients (cash / card / store credit / credit reversal)
    patientRefunds: round2(returns.refunds),
    // Taken off insurance claims
    insurerReturned: round2(returns.insurerReturned),
    returnCount: returns.count,
    revenue: round2(revenue),
    salesTax: round2(sales.tax),
    tax: round2(tax),
    discount: round2(sales.discount),
    netRevenue: round2(netRevenue),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    profitMargin: netRevenue > 0 ? Number(((grossProfit / netRevenue) * 100).toFixed(1)) : 0,
    orders: sales.orders,
    unitsSold: sales.units,
    avgTicket: sales.orders > 0 ? round2(sales.grossSales / sales.orders) : 0,
    creditOutstanding: round2(sales.balanceDue),
  };
};

const pctChange = (cur, prev) => {
  if (!prev) return cur ? null : 0;
  return Number((((cur - prev) / Math.abs(prev)) * 100).toFixed(1));
};

const COMPARE_KEYS = ['revenue', 'netRevenue', 'grossProfit', 'cogs', 'orders', 'avgTicket', 'tax', 'refunds', 'unitsSold'];

const buildComparison = (current, previous) =>
  Object.fromEntries(
    COMPARE_KEYS.map((k) => [
      k,
      { current: current[k] || 0, previous: previous ? previous[k] || 0 : null, changePct: previous ? pctChange(current[k] || 0, previous[k] || 0) : null },
    ])
  );

const formatGrowth = (pct) => (pct === null || pct === undefined ? 'n/a' : `${pct >= 0 ? '+' : ''}${pct}%`);

// Revenue + order count per local day for non-voided sales in [from, to).
// Returns a Map keyed by 'YYYY-MM-DD'.
const getDailySales = async (pharmacyId, from, timeZone, to = null) => {
  const rows = await Sale.aggregate([
    { $match: saleMatch(pharmacyId, from, to) },
    {
      $group: {
        _id: localDayExpr('$createdAt', timeZone),
        revenue: { $sum: '$grandTotal' },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
};

// Payment split per method for non-voided sales in [from, to). Uses the split
// payments when present (ignoring failed/refunded ones), else the main method
// with the grand total. An unpaid balance counts as 'credit'.
const getPaymentBreakdown = async (pharmacyId, from, to) => {
  const rows = await Sale.aggregate([
    { $match: saleMatch(pharmacyId, from, to) },
    {
      $project: {
        pays: {
          $let: {
            vars: {
              ok: {
                $filter: {
                  input: { $ifNull: ['$payments', []] },
                  as: 'p',
                  cond: { $not: [{ $in: ['$$p.status', ['failed', 'refunded']] }] },
                },
              },
            },
            in: {
              $cond: [
                { $gt: [{ $size: '$$ok' }, 0] },
                {
                  $concatArrays: [
                    { $map: { input: '$$ok', as: 'p', in: { method: '$$p.method', amount: '$$p.amount' } } },
                    {
                      $cond: [
                        {
                          $and: [
                            { $gt: [{ $ifNull: ['$balanceDue', 0] }, 0] },
                            { $not: [{ $in: ['credit', '$$ok.method'] }] },
                          ],
                        },
                        [{ method: 'credit', amount: '$balanceDue' }],
                        [],
                      ],
                    },
                  ],
                },
                [{ method: { $ifNull: ['$paymentMethod', 'cash'] }, amount: '$grandTotal' }],
              ],
            },
          },
        },
      },
    },
    { $unwind: '$pays' },
    { $group: { _id: { m: '$pays.method', s: '$_id' }, amount: { $sum: '$pays.amount' } } },
    { $group: { _id: '$_id.m', count: { $sum: 1 }, total: { $sum: '$amount' } } },
  ]);

  const out = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    mobile_money: { count: 0, total: 0 },
    credit: { count: 0, total: 0 },
  };
  rows.forEach((r) => {
    const key = r._id || 'cash';
    if (!out[key]) out[key] = { count: 0, total: 0 };
    out[key].count += r.count || 0;
    out[key].total = round2(out[key].total + (r.total || 0));
  });
  return out;
};

// Revenue trend points across [from, to): daily when <= 92 days, else monthly.
const buildRangeTrend = (dailySales, from, to, timeZone) => {
  const spanDays = Math.round((to - from) / DAY_MS);
  const points = [];
  if (spanDays <= 92) {
    for (let t = from.getTime() + 12 * 3600 * 1000; t < to.getTime(); t += DAY_MS) {
      const dt = new Date(t);
      const dateStr = getLocalDateString(dt, timeZone);
      const b = dailySales.get(dateStr);
      points.push({
        date: dateStr,
        dayName: spanDays <= 7 ? getLocalDayName(dt, timeZone) : getLocalMonthDay(dt, timeZone),
        revenue: round2(b?.revenue),
        orderCount: b?.count || 0,
      });
    }
    return points;
  }
  const months = new Map();
  dailySales.forEach((b, day) => {
    const key = day.slice(0, 7);
    const m = months.get(key) || { revenue: 0, count: 0 };
    m.revenue += b.revenue || 0;
    m.count += b.count || 0;
    months.set(key, m);
  });
  [...months.keys()].sort().forEach((key) => {
    const m = months.get(key);
    points.push({ date: key, dayName: key, revenue: round2(m.revenue), orderCount: m.count });
  });
  return points;
};

const rangeMeta = (r) => ({
  range: r.range,
  rangeLabel: r.label,
  from: r.range === 'all' ? null : r.from,
  to: r.to,
  previous: r.prevFrom ? { from: r.prevFrom, to: r.prevTo } : null,
});

module.exports = {
  saleMatch,
  itemCostStages,
  lineAmountStages,
  getReturnTotals,
  loadReturnLines,
  getPeriodSummary,
  buildComparison,
  formatGrowth,
  getDailySales,
  getPaymentBreakdown,
  buildRangeTrend,
  rangeMeta,
};
