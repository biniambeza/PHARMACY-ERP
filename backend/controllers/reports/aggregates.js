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

// Unwinds sale items and adds:
//   _unitCost: items.costPrice (recorded at sale) || batch purchasePrice || medicine costPrice || 0
//   _lineCost: quantity (base units) * _unitCost
//   _lineNet:  item subtotal minus its share of the sale discount and of the tax
//              (so per-line revenue sums to grandTotal - tax)
//   _med:      [{ name, category, costPrice }]
const itemCostStages = () => [
  { $unwind: '$items' },
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
  {
    $addFields: {
      _lineCost: { $multiply: [{ $ifNull: ['$items.quantity', 0] }, '$_unitCost'] },
      _lineNet: { $multiply: [{ $ifNull: ['$items.subtotal', 0] }, '$_netFactor'] },
    },
  },
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
  byMedicine: new Map(),
  bySaleStaff: new Map(),
  bySaleShift: new Map(),
});

// Refunds of non-voided sales processed in [from, to). Restocked items give
// their cost back (they are inventory again); discarded items stay a cost.
const getReturnTotals = async (pharmacyId, from, to) => {
  const Return = getReturnModel();
  if (!Return) return EMPTY_RETURNS();

  const match = { pharmacyId };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lt = to;
  }

  const [facet] = await Return.aggregate([
    { $match: match },
    {
      $lookup: {
        from: Sale.collection.name,
        localField: 'saleId',
        foreignField: '_id',
        pipeline: [{ $project: { voided: 1, items: 1, staffId: 1, pharmacistId: 1, shiftId: 1 } }],
        as: '_sale',
      },
    },
    { $addFields: { _saleDoc: { $first: '$_sale' } } },
    { $match: { '_saleDoc.voided': { $ne: true } } },
    {
      $facet: {
        totals: [{ $group: { _id: null, refunds: { $sum: '$refundTotal' }, count: { $sum: 1 } } }],
        bySaleStaff: [
          {
            $group: {
              _id: { $ifNull: ['$_saleDoc.staffId', '$_saleDoc.pharmacistId'] },
              refunds: { $sum: '$refundTotal' },
              count: { $sum: 1 },
            },
          },
        ],
        bySaleShift: [
          { $group: { _id: '$_saleDoc.shiftId', refunds: { $sum: '$refundTotal' }, count: { $sum: 1 } } },
        ],
        items: [
          { $unwind: '$items' },
          {
            $addFields: {
              _saleItem: {
                $first: {
                  $filter: {
                    input: { $ifNull: ['$_saleDoc.items', []] },
                    as: 'si',
                    cond: { $eq: ['$$si._id', '$items.saleItemId'] },
                  },
                },
              },
            },
          },
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
                $ifNull: [
                  '$_saleItem.costPrice',
                  { $first: '$_batch.purchasePrice' },
                  { $first: '$_med.costPrice' },
                  0,
                ],
              },
            },
          },
          {
            $group: {
              _id: '$items.medicineId',
              name: { $first: { $ifNull: [{ $first: '$_med.name' }, '$items.name'] } },
              category: { $first: { $ifNull: [{ $first: '$_med.category' }, 'Uncategorized'] } },
              quantity: { $sum: '$items.quantity' },
              refund: { $sum: '$items.refundAmount' },
              restockedCost: {
                $sum: {
                  $cond: [{ $eq: ['$items.restocked', true] }, { $multiply: ['$items.quantity', '$_unitCost'] }, 0],
                },
              },
            },
          },
        ],
      },
    },
  ]);

  const totals = facet?.totals?.[0] || {};
  const items = facet?.items || [];
  return {
    refunds: totals.refunds || 0,
    count: totals.count || 0,
    restockedCost: items.reduce((s, r) => s + (r.restockedCost || 0), 0),
    byMedicine: new Map(items.map((r) => [String(r._id), r])),
    bySaleStaff: new Map((facet?.bySaleStaff || []).map((r) => [String(r._id), r])),
    bySaleShift: new Map((facet?.bySaleShift || []).map((r) => [String(r._id), r])),
  };
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

// Full financial summary of a window, net of voids and returns.
//   revenue     = sales receipts (incl. tax) - refunds
//   netRevenue  = revenue - tax
//   cogs        = cost of items sold - cost of items restocked by returns
//   grossProfit = netRevenue - cogs
const getPeriodSummary = async (pharmacyId, from, to) => {
  const [sales, returns] = await Promise.all([
    getSaleTotals(pharmacyId, from, to),
    getReturnTotals(pharmacyId, from, to),
  ]);
  const revenue = sales.grossSales - returns.refunds;
  const netRevenue = revenue - sales.tax;
  const cogs = Math.max(0, sales.cogs - returns.restockedCost);
  const grossProfit = netRevenue - cogs;
  return {
    grossSales: round2(sales.grossSales),
    refunds: round2(returns.refunds),
    returnCount: returns.count,
    revenue: round2(revenue),
    tax: round2(sales.tax),
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
  getReturnTotals,
  getPeriodSummary,
  buildComparison,
  formatGrowth,
  getDailySales,
  getPaymentBreakdown,
  buildRangeTrend,
  rangeMeta,
};
