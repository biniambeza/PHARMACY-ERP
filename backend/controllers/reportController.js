const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Pharmacy = require('../models/Pharmacy');
const StockMovement = require('../models/StockMovement');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_PO_STATUSES = ['ordered', 'partially_received'];

// Validate the client's IANA timezone (x-timezone header or ?timezone=) and
// return its canonical name. Falls back to UTC when missing or invalid, so the
// value is always safe to hand to MongoDB's $dateToString.
const getClientTimezone = (req) => {
  const raw = req?.headers?.['x-timezone'] || req?.query?.timezone;
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= 64) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone || 'UTC';
    } catch {
      // invalid timezone string: fall through
    }
  }
  return 'UTC';
};

// aggregate() does not auto-cast, so the tenant id must be a real ObjectId.
const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (id && mongoose.Types.ObjectId.isValid(String(id))) return new mongoose.Types.ObjectId(String(id));
  throw new AppError('Invalid pharmacy context', 400);
};

const round2 = (n) => Number((n || 0).toFixed(2));

// Helper to format Date into YYYY-MM-DD in the target timezone
const getLocalDateString = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().split('T')[0];
  }
};

// Helper to format weekday ('Thu', 'Wed', etc.) in the target timezone
const getLocalDayName = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
};

// Helper to format month and day ('Oct 8', 'Oct 7', etc.) in the target timezone
const getLocalMonthDay = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};

// Helper to format timestamps into relative time strings
const formatRelativeTime = (date) => {
  if (!date) return 'Recently';
  const diffSec = Math.floor((new Date() - new Date(date)) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

// Group expression: local calendar day (YYYY-MM-DD) of a date field.
const localDayExpr = (dateExpr, timeZone) => ({
  $dateToString: { format: '%Y-%m-%d', date: dateExpr, timezone: timeZone },
});

const localMonthExpr = (dateExpr, timeZone) => ({
  $dateToString: { format: '%Y-%m', date: dateExpr, timezone: timeZone },
});

// ---------------------------------------------------------------------------
// Time ranges
// ---------------------------------------------------------------------------

// Offset (ms) of `timeZone` from UTC at instant `date`.
const tzOffsetMs = (date, timeZone) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return 0;
  }
};

// UTC instant of local midnight for local calendar date y-m-d (month 1-based; day may overflow).
const localMidnight = (y, m, d, timeZone) => {
  const guess = Date.UTC(y, m - 1, d);
  const off1 = tzOffsetMs(new Date(guess), timeZone);
  let result = guess - off1;
  const off2 = tzOffsetMs(new Date(result), timeZone);
  if (off2 !== off1) result = guess - off2;
  return new Date(result);
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const parseLocalDate = (value, field) => {
  if (typeof value !== 'string') throw new AppError(`${field} must be a date (YYYY-MM-DD)`, 400);
  const m = DATE_RE.exec(value.trim().slice(0, 10));
  if (!m) throw new AppError(`${field} must be a date (YYYY-MM-DD)`, 400);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new AppError(`${field} is not a valid date`, 400);
  }
  return [y, mo, d];
};

const RANGES = ['today', '7d', 'monthly', '30d', 'yearly', 'custom', 'all'];

// Resolves ?range=7d|monthly|yearly|today|all|custom (&from=YYYY-MM-DD&to=YYYY-MM-DD)
// into a half-open window [from, to) in the client's timezone, plus the
// previous comparable window [prevFrom, prevTo).
// - 7d: the last 7 local days incl. today; monthly/30d: the last 30 local days;
//   yearly: the current local year to date (previous = same span last year);
//   custom: from..to inclusive local days; all: everything (no previous).
// Passing from/to without range implies custom.
const parseRange = (req, defaultRange = '7d') => {
  const timeZone = getClientTimezone(req);
  const q = req.query || {};
  let raw = q.range;
  if (raw === undefined && (q.from !== undefined || q.to !== undefined)) raw = 'custom';
  if (raw === undefined) raw = defaultRange;
  if (typeof raw !== 'string') throw new AppError('Invalid range parameter', 400);
  let range = raw.toLowerCase();
  if (!RANGES.includes(range)) throw new AppError(`range must be one of ${RANGES.join(', ')}`, 400);
  if (range === '30d') range = 'monthly';

  const nowMs = Date.now();
  const [y, m, d] = getLocalDateString(new Date(nowMs), timeZone).split('-').map(Number);
  const tomorrow = localMidnight(y, m, d + 1, timeZone);
  let from;
  let to = tomorrow;
  let prevFrom = null;
  let prevTo = null;
  let label;

  switch (range) {
    case 'today':
      from = localMidnight(y, m, d, timeZone);
      label = 'Today';
      break;
    case 'monthly':
      from = localMidnight(y, m, d - 29, timeZone);
      label = 'Last 30 days';
      break;
    case 'yearly':
      from = localMidnight(y, 1, 1, timeZone);
      prevFrom = localMidnight(y - 1, 1, 1, timeZone);
      prevTo = localMidnight(y - 1, m, d + 1, timeZone);
      label = `${y} year to date`;
      break;
    case 'custom': {
      if (q.from === undefined || q.to === undefined) {
        throw new AppError('Custom range needs both from and to (YYYY-MM-DD)', 400);
      }
      const [fy, fm, fd] = parseLocalDate(q.from, 'from');
      const [ty, tm, td] = parseLocalDate(q.to, 'to');
      from = localMidnight(fy, fm, fd, timeZone);
      to = localMidnight(ty, tm, td + 1, timeZone);
      if (to <= from) throw new AppError('from must be on or before to', 400);
      if (to - from > 3700 * DAY_MS) throw new AppError('Custom range cannot exceed 10 years', 400);
      label = `${q.from.slice(0, 10)} to ${q.to.slice(0, 10)}`;
      break;
    }
    case 'all':
      from = new Date(0);
      label = 'All time';
      break;
    case '7d':
    default:
      from = localMidnight(y, m, d - 6, timeZone);
      label = 'Last 7 days';
      break;
  }

  if (range !== 'all' && !prevFrom) {
    prevTo = from;
    prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  }

  return { range, label, from, to, prevFrom, prevTo, timeZone };
};

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
    return require('../models/Return');
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

// @desc    Get complete real-time dashboard overview aggregated from all collections
// @route   GET /api/reports/overview
// @access  Private (Pharmacist only)
const getDashboardOverview = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, '7d');
  const { timeZone } = period;
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const todayStr = getLocalDateString(now, timeZone);
  const thirtyDays = new Date(nowMs + 30 * DAY_MS);
  const sixtyDays = new Date(nowMs + 60 * DAY_MS);

  // Trend window: last 5 local days (plus margin for any UTC offset).
  const trendFrom = new Date(nowMs - 7 * DAY_MS);
  const lookupMedicineName = {
    $lookup: {
      from: Medicine.collection.name,
      localField: 'medicineId',
      foreignField: '_id',
      pipeline: [{ $project: { name: 1 } }],
      as: 'medicine',
    },
  };

  const [
    pharmacy, allTime, periodSummary, prevSummary, dailySales, recentSales, poFacetRows, batchFacetRows, medFacetRows, suppliers,
  ] =
    await Promise.all([
      Pharmacy.findById(pharmacyId).select('name licenseNo address phone settings').lean(),

      // All-time totals (net of voids and returns, COGS from actual costs)
      getPeriodSummary(pharmacyId, null, null),
      // Selected period and the previous comparable period
      getPeriodSummary(pharmacyId, period.range === 'all' ? null : period.from, period.to),
      period.prevFrom ? getPeriodSummary(pharmacyId, period.prevFrom, period.prevTo) : Promise.resolve(null),

      getDailySales(pharmacyId, trendFrom, timeZone),

      Sale.find({ pharmacyId }).sort({ createdAt: -1 }).limit(5).lean(),

      PurchaseOrder.aggregate([
        { $match: { pharmacyId } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  // Committed purchase value (drafts and cancelled orders excluded)
                  totalCost: {
                    $sum: { $cond: [{ $in: ['$status', ['draft', 'cancelled']] }, 0, { $ifNull: ['$totalAmount', 0] }] },
                  },
                  // received + closed (closed short) count as completed
                  received: { $sum: { $cond: [{ $in: ['$status', ['received', 'closed']] }, 1, 0] } },
                  // ordered + partially_received are still in progress
                  ordered: { $sum: { $cond: [{ $in: ['$status', OPEN_PO_STATUSES] }, 1, 0] } },
                  cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                  draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
                  // Value still to be delivered: order total minus what was already received
                  orderedValue: {
                    $sum: {
                      $cond: [
                        { $in: ['$status', OPEN_PO_STATUSES] },
                        {
                          $max: [
                            0,
                            {
                              $subtract: [
                                { $ifNull: ['$totalAmount', 0] },
                                { $sum: { $ifNull: ['$receipts.totalCost', []] } },
                              ],
                            },
                          ],
                        },
                        0,
                      ],
                    },
                  },
                  onOrderUnits: {
                    $sum: {
                      $cond: [
                        { $in: ['$status', OPEN_PO_STATUSES] },
                        {
                          $max: [
                            0,
                            {
                              $subtract: [
                                { $sum: { $ifNull: ['$items.quantityOrdered', []] } },
                                { $sum: { $ifNull: ['$items.quantityReceived', []] } },
                              ],
                            },
                          ],
                        },
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            daily: [
              { $addFields: { _poDate: { $ifNull: ['$createdAt', '$orderDate'] } } },
              { $match: { _poDate: { $gte: trendFrom } } },
              { $group: { _id: localDayExpr('$_poDate', timeZone), expenses: { $sum: '$totalAmount' } } },
            ],
            bySupplier: [
              { $group: { _id: '$supplierId', spend: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
            ],
            pending: [
              { $match: { status: { $in: OPEN_PO_STATUSES } } },
              { $sort: { createdAt: -1 } },
              { $limit: 4 },
              { $project: { poNumber: 1, expectedDelivery: 1 } },
            ],
            recent: [
              { $sort: { createdAt: -1 } },
              { $limit: 3 },
              {
                $lookup: {
                  from: Supplier.collection.name,
                  localField: 'supplierId',
                  foreignField: '_id',
                  pipeline: [{ $project: { name: 1 } }],
                  as: 'supplier',
                },
              },
              { $project: { poNumber: 1, status: 1, totalAmount: 1, createdAt: 1, supplier: 1 } },
            ],
          },
        },
      ]),

      StockBatch.aggregate([
        { $match: { pharmacyId } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  completed: {
                    $sum: { $cond: [{ $or: [{ $eq: ['$quantity', 0] }, { $eq: ['$status', 'depleted'] }] }, 1, 0] },
                  },
                },
              },
            ],
            // Lifecycle buckets over every active batch with stock, including
            // expired-but-active lots (they fall under "delayed").
            lifecycle: [
              { $match: { status: 'active', quantity: { $gt: 0 } } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  onTrack: { $sum: { $cond: [{ $gt: ['$expiryDate', sixtyDays] }, 1, 0] } },
                  atRisk: {
                    $sum: {
                      $cond: [
                        { $and: [{ $lte: ['$expiryDate', sixtyDays] }, { $gt: ['$expiryDate', thirtyDays] }] },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            // Sellable stock: active, in stock and not yet expired.
            available: [
              { $match: { status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
              { $group: { _id: null, batches: { $sum: 1 }, units: { $sum: '$quantity' } } },
            ],
            fefo: [
              { $match: { status: 'active', quantity: { $gt: 0 }, expiryDate: { $lte: thirtyDays } } },
              { $sort: { _id: 1 } },
              { $limit: 3 },
              lookupMedicineName,
              { $project: { batchNo: 1, expiryDate: 1, medicine: 1 } },
            ],
            recent: [
              { $sort: { createdAt: -1 } },
              { $limit: 3 },
              lookupMedicineName,
              { $project: { batchNo: 1, quantity: 1, createdAt: 1, medicine: 1 } },
            ],
          },
        },
      ]),

      // Per-medicine sellable stock vs. min level, computed in the database.
      Medicine.aggregate([
        { $match: { pharmacyId } },
        { $project: { name: 1, minStockLevel: 1 } },
        {
          $lookup: {
            from: StockBatch.collection.name,
            localField: '_id',
            foreignField: 'medicineId',
            pipeline: [
              { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
              { $group: { _id: null, qty: { $sum: '$quantity' } } },
            ],
            as: 'stock',
          },
        },
        {
          $addFields: {
            currentStock: { $ifNull: [{ $first: '$stock.qty' }, 0] },
            // mirrors `m.minStockLevel || 10`
            minLevel: {
              $cond: [{ $in: [{ $ifNull: ['$minStockLevel', 0] }, [0]] }, 10, '$minStockLevel'],
            },
          },
        },
        {
          $facet: {
            counts: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  inStock: { $sum: { $cond: [{ $gt: ['$currentStock', '$minLevel'] }, 1, 0] } },
                  lowStock: {
                    $sum: {
                      $cond: [
                        { $and: [{ $lte: ['$currentStock', '$minLevel'] }, { $gt: ['$currentStock', 0] }] },
                        1,
                        0,
                      ],
                    },
                  },
                },
              },
            ],
            needsRestock: [
              { $match: { $expr: { $lte: ['$currentStock', '$minLevel'] } } },
              { $sort: { _id: 1 } },
              { $limit: 2 },
              { $project: { name: 1, currentStock: 1, minLevel: 1 } },
            ],
          },
        },
      ]),

      Supplier.find({ pharmacyId }).select('name contactPerson').lean(),
    ]);

  // 2. Financial KPIs (all-time totals keep their names; period values live in kpis.period)
  const totalRevenue = allTime.revenue;
  const totalOrders = allTime.orders;
  const todayBucket = dailySales.get(todayStr) || { revenue: 0, count: 0 };
  const todayRevenue = todayBucket.revenue || 0;
  const todayOrders = todayBucket.count || 0;

  const poFacet = poFacetRows[0] || {};
  const poTotals = poFacet.totals?.[0] || {
    count: 0, totalCost: 0, received: 0, ordered: 0, cancelled: 0, draft: 0, orderedValue: 0, onOrderUnits: 0,
  };
  const poCount = poTotals.count || 0;

  // Expenses = cost of goods sold (actual batch costs); profit = net revenue - COGS.
  const totalPOCost = poTotals.totalCost || 0;
  const totalCOGS = allTime.cogs;
  const totalExpenses = totalCOGS;
  const netProfit = allTime.grossProfit;
  const comparison = buildComparison(periodSummary, prevSummary);

  // Sellable batches & inventory units
  const batchFacet = batchFacetRows[0] || {};
  const available = batchFacet.available?.[0] || { batches: 0, units: 0 };
  const totalBatches = available.batches || 0;
  const totalStockUnits = available.units || 0;

  const medFacet = medFacetRows[0] || {};
  const medCounts = medFacet.counts?.[0] || { total: 0, inStock: 0, lowStock: 0 };
  const totalMedicinesCount = medCounts.total || 0;

  // 3. Revenue vs Expenses Chart Trend (Last 5 daily intervals in user's timezone)
  const poDaily = new Map((poFacet.daily || []).map((r) => [r._id, r.expenses || 0]));
  const [tYear, tMonth, tDay] = todayStr.split('-').map(Number);
  const trendPoints = [];
  for (let i = 4; i >= 0; i--) {
    const targetDate = new Date(Date.UTC(tYear, tMonth - 1, tDay - i, 12, 0, 0));
    const dStr = getLocalDateString(targetDate, timeZone);
    trendPoints.push({
      date: dStr,
      label: getLocalMonthDay(targetDate, timeZone),
      revenue: round2(dailySales.get(dStr)?.revenue),
      expenses: round2(poDaily.get(dStr)),
    });
  }

  // 4. Workflow Status (from real Purchase Orders & Sales)
  const poReceived = poTotals.received || 0;
  const poOrdered = poTotals.ordered || 0;
  const poCancelled = poTotals.cancelled || 0;
  const poPending = poTotals.draft || 0;
  const totalWorkflows = poCount > 0 ? poCount : Math.max(totalOrders, 1);
  const pct = (n, d) => Number(((n / d) * 100).toFixed(1));

  const workflowStatus = {
    total: poCount > 0 ? poCount : totalOrders,
    completed: poReceived,
    completedPct: totalWorkflows > 0 ? pct(poReceived, totalWorkflows) : 0,
    inProgress: poOrdered,
    inProgressPct: totalWorkflows > 0 ? pct(poOrdered, totalWorkflows) : 0,
    pendingReview: poPending,
    pendingPct: totalWorkflows > 0 ? pct(poPending, totalWorkflows) : 0,
    onHold: poCancelled,
    onHoldPct: totalWorkflows > 0 ? pct(poCancelled, totalWorkflows) : 0,
  };

  // 5. Inventory Overview (sellable medicine stock health)
  const inStockCount = medCounts.inStock || 0;
  const lowStockCount = medCounts.lowStock || 0;
  const outOfStockCount = totalMedicinesCount - inStockCount - lowStockCount;
  const onOrderUnits = poTotals.onOrderUnits || 0;

  const totalTrackedItems = totalMedicinesCount > 0 ? totalMedicinesCount : 1;
  const inventoryOverview = {
    totalUnits: totalStockUnits,
    inStock: inStockCount,
    inStockPct: pct(inStockCount, totalTrackedItems),
    lowStock: lowStockCount,
    lowStockPct: pct(lowStockCount, totalTrackedItems),
    outOfStock: outOfStockCount,
    outOfStockPct: pct(outOfStockCount, totalTrackedItems),
    onOrder: onOrderUnits,
    onOrderPct: pct(onOrderUnits, Math.max(totalStockUnits + onOrderUnits, 1)),
  };

  // 6. Pending Procurement
  const pendingProcurement = {
    count: poOrdered,
    totalValue: round2(poTotals.orderedValue),
  };

  // 7. Batch Lifecycle Overview (FEFO Risk)
  const batchTotals = batchFacet.totals?.[0] || { total: 0, completed: 0 };
  const lifecycle = batchFacet.lifecycle?.[0] || { count: 0, onTrack: 0, atRisk: 0 };
  const allBatchCount = batchTotals.total || 0;
  const activeWithStock = lifecycle.count || 0;
  const onTrackBatches = lifecycle.onTrack || 0;
  const atRiskBatches = lifecycle.atRisk || 0;
  const delayedBatches = activeWithStock - onTrackBatches - atRiskBatches; // expiring < 30 days (or expired)
  const completedBatches = batchTotals.completed || 0;

  const totalBatchCount = allBatchCount > 0 ? allBatchCount : 1;
  const batchOverview = {
    total: allBatchCount,
    onTrack: onTrackBatches,
    onTrackPct: pct(onTrackBatches, totalBatchCount),
    atRisk: atRiskBatches,
    atRiskPct: pct(atRiskBatches, totalBatchCount),
    delayed: delayedBatches,
    delayedPct: pct(delayedBatches, totalBatchCount),
    completed: completedBatches,
    completedPct: pct(completedBatches, totalBatchCount),
  };

  // 8. Team Tasks (derived from real database anomalies and workflows)
  const operationalTasks = [];
  let taskId = 1;

  (medFacet.needsRestock || []).forEach((m) => {
    if (taskId <= 2) {
      operationalTasks.push({
        id: taskId++,
        title: `Restock ${m.name} (Stock: ${m.currentStock}/${m.minLevel})`,
        dept: 'Inventory',
        date: 'Immediate',
        priority: 'High',
        checked: false,
      });
    }
  });

  (batchFacet.fefo || []).forEach((b) => {
    if (taskId <= 3) {
      const exp = new Date(b.expiryDate);
      operationalTasks.push({
        id: taskId++,
        title: `FEFO Expiry: Batch #${b.batchNo} (${b.medicine?.[0]?.name || 'Meds'})`,
        dept: 'Clinical',
        date: exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        priority: 'High',
        checked: false,
      });
    }
  });

  (poFacet.pending || []).forEach((po) => {
    if (taskId <= 4) {
      operationalTasks.push({
        id: taskId++,
        title: `Receive Delivery: PO #${po.poNumber}`,
        dept: 'Procurement',
        date: po.expectedDelivery
          ? new Date(po.expectedDelivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'Pending',
        priority: 'Medium',
        checked: false,
      });
    }
  });

  if (operationalTasks.length < 5) {
    operationalTasks.push({
      id: taskId++,
      title: `Reconcile Daily Cashier Drawer (${todayOrders} sales)`,
      dept: 'Finance',
      date: 'Today',
      priority: 'Medium',
      checked: todayOrders > 0,
    });
  }

  if (operationalTasks.length < 5) {
    operationalTasks.push({
      id: taskId++,
      title: `Review Supplier Catalog & Vendor Contracts`,
      dept: 'Operations',
      date: 'Monthly',
      priority: 'Low',
      checked: false,
    });
  }

  // 9. Recent Activities (combined event stream)
  const activities = [];

  recentSales.slice(0, 4).forEach((s) => {
    activities.push({
      timestamp: new Date(s.createdAt),
      icon: '✓',
      color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
      title: `Sale #${s.invoiceNumber} ${s.voided ? 'voided' : 'paid'} (${Number(s.grandTotal).toFixed(2)})`,
      author: s.customer?.name || 'Walk-in Customer',
      time: formatRelativeTime(s.createdAt),
    });
  });

  (batchFacet.recent || []).forEach((b) => {
    activities.push({
      timestamp: new Date(b.createdAt),
      icon: '📦',
      color: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
      title: `Stock Batch #${b.batchNo} received (${b.quantity} units)`,
      author: b.medicine?.[0]?.name || 'Main Inventory',
      time: formatRelativeTime(b.createdAt),
    });
  });

  (poFacet.recent || []).forEach((po) => {
    activities.push({
      timestamp: new Date(po.createdAt),
      icon: '📄',
      color: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
      title: `PO #${po.poNumber} status: ${po.status} (${Number(po.totalAmount).toFixed(2)})`,
      author: po.supplier?.[0]?.name || 'Procurement',
      time: formatRelativeTime(po.createdAt),
    });
  });

  activities.sort((a, b) => b.timestamp - a.timestamp);
  const recentActivities = activities.slice(0, 5);

  // 10. Top Suppliers
  const supplierSpend = new Map((poFacet.bySupplier || []).map((r) => [String(r._id), r]));
  const supplierStats = suppliers.map((sup) => {
    const agg = supplierSpend.get(sup._id.toString());
    return {
      id: sup._id,
      name: sup.name,
      cat: sup.contactPerson || 'Pharmaceutical Distributor',
      spend: round2(agg?.spend),
      orders: agg?.orders || 0,
      rating: '4.8 ★',
    };
  });
  supplierStats.sort((a, b) => b.spend - a.spend);
  const topSuppliers = supplierStats.slice(0, 4);

  return res.status(200).json({
    success: true,
    overview: {
      pharmacy: {
        name: pharmacy?.name || 'Pharmacy ERP',
        licenseNo: pharmacy?.licenseNo || 'N/A',
        address: pharmacy?.address || 'N/A',
        phone: pharmacy?.phone || 'N/A',
      },
      kpis: {
        totalRevenue: round2(totalRevenue),
        todayRevenue: round2(todayRevenue),
        totalOrders,
        todayOrders,
        totalExpenses: round2(totalExpenses),
        netProfit: round2(netProfit),
        activeBatches: totalBatches,
        activeMedicines: totalMedicinesCount,
        totalStockUnits,
        totalCOGS: round2(totalCOGS),
        totalPurchaseCost: round2(totalPOCost),
        totalRefunds: allTime.refunds,
        // Growth of the selected period vs the previous one
        revenueGrowth: formatGrowth(comparison.revenue.changePct),
        expenseGrowth: formatGrowth(comparison.cogs.changePct),
        profitGrowth: formatGrowth(comparison.grossProfit.changePct),
        period: { ...rangeMeta(period), ...periodSummary },
        allTime,
      },
      comparison,
      currency: pharmacy?.settings?.currency || 'ETB',
      revenueVsExpenses: trendPoints,
      workflowStatus,
      inventoryOverview,
      pendingProcurement,
      batchOverview,
      operationalTasks: operationalTasks.slice(0, 5),
      recentActivities,
      topSuppliers,
      recentSales,
    },
  });
};

// @desc    Financial analytics for a period: revenue, COGS, margin, payment
//          split, top medicines, trends, expiry risk and previous-period comparison.
// @route   GET /api/reports/analytics?range=7d|monthly|yearly|today|all|custom&from&to
// @access  Private (reports:view)
const getFinancialAnalytics = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, '7d');
  const { timeZone } = period;
  const periodFrom = period.range === 'all' ? null : period.from;

  const nowMs = Date.now();
  const todayStr = getLocalDateString(new Date(nowMs), timeZone);
  const [fYear, fMonth, fDay] = todayStr.split('-').map(Number);

  // Fixed chart windows (7d / 30d / current year) for instant client switching.
  const trendFrom = new Date(Math.min(Date.UTC(fYear, 0, 1) - 2 * DAY_MS, nowMs - 32 * DAY_MS));
  const thirtyDaysFromNow = new Date(nowMs + 30 * DAY_MS);

  const [dailySales, rangeDaily, summary, prevSummary, paymentMethods, byMedicineRows, returns, expiryRows] =
    await Promise.all([
      getDailySales(pharmacyId, trendFrom, timeZone),
      getDailySales(pharmacyId, periodFrom, timeZone, period.to),
      getPeriodSummary(pharmacyId, periodFrom, period.to),
      period.prevFrom ? getPeriodSummary(pharmacyId, period.prevFrom, period.prevTo) : Promise.resolve(null),
      getPaymentBreakdown(pharmacyId, periodFrom, period.to),
      Sale.aggregate([
        { $match: saleMatch(pharmacyId, periodFrom, period.to) },
        ...itemCostStages(),
        {
          $group: {
            _id: '$items.medicineId',
            name: { $first: { $ifNull: [{ $first: '$_med.name' }, '$items.name'] } },
            unitsSold: { $sum: { $ifNull: ['$items.quantity', 0] } },
            revenue: { $sum: '$_lineNet' },
            cogs: { $sum: '$_lineCost' },
          },
        },
      ]).option({ allowDiskUse: true }),
      getReturnTotals(pharmacyId, periodFrom, period.to),
      StockBatch.aggregate([
        {
          $match: {
            pharmacyId,
            status: 'active',
            quantity: { $gt: 0 },
            expiryDate: { $lte: thirtyDaysFromNow },
          },
        },
        {
          $lookup: {
            from: Medicine.collection.name,
            localField: 'medicineId',
            foreignField: '_id',
            pipeline: [{ $project: { price: 1 } }],
            as: 'medicine',
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            atCost: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
            atRetail: {
              $sum: { $multiply: ['$quantity', { $ifNull: [{ $first: '$medicine.price' }, 0] }] },
            },
          },
        },
      ]),
    ]);

  // Trend curves
  const dayPoint = (i, labelFn) => {
    const targetDate = new Date(Date.UTC(fYear, fMonth - 1, fDay - i, 12, 0, 0));
    const dateStr = getLocalDateString(targetDate, timeZone);
    const bucket = dailySales.get(dateStr);
    return {
      date: dateStr,
      dayName: labelFn(targetDate, timeZone),
      revenue: round2(bucket?.revenue),
      orderCount: bucket?.count || 0,
    };
  };

  const trend7d = [];
  for (let i = 6; i >= 0; i--) trend7d.push(dayPoint(i, getLocalDayName));

  const trendMonthly = [];
  for (let i = 29; i >= 0; i--) trendMonthly.push(dayPoint(i, getLocalMonthDay));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthTotals = monthNames.map(() => ({ revenue: 0, count: 0 }));
  const yearPrefix = `${fYear}-`;
  dailySales.forEach((bucket, day) => {
    if (day.startsWith(yearPrefix)) {
      const m = Number(day.slice(5, 7)) - 1;
      if (monthTotals[m]) {
        monthTotals[m].revenue += bucket.revenue || 0;
        monthTotals[m].count += bucket.count || 0;
      }
    }
  });
  const trendYearly = monthNames.map((name, m) => ({
    date: `${fYear}-${String(m + 1).padStart(2, '0')}`,
    dayName: name,
    revenue: round2(monthTotals[m].revenue),
    orderCount: monthTotals[m].count,
  }));

  const trends = { '7d': trend7d, monthly: trendMonthly, yearly: trendYearly };
  const rangeTrend =
    trends[period.range] || buildRangeTrend(rangeDaily, period.range === 'all' ? new Date(nowMs - 3700 * DAY_MS) : period.from, period.to, timeZone);
  if (period.range === 'custom' || period.range === 'today') trends.custom = rangeTrend;

  // Top medicines in the period, net of returns, with actual cost
  const medicineRows = byMedicineRows.map((row) => {
    const ret = returns.byMedicine.get(String(row._id));
    const unitsSold = (row.unitsSold || 0) - (ret?.quantity || 0);
    const revenue = (row.revenue || 0) - (ret?.refund || 0);
    const cogs = (row.cogs || 0) - (ret?.restockedCost || 0);
    return {
      id: String(row._id),
      name: row.name,
      unitsSold,
      revenue: round2(revenue),
      cogs: round2(cogs),
      estimatedProfit: round2(revenue - cogs),
    };
  });
  const topMedicines = medicineRows.sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const expiry = expiryRows[0] || { count: 0, atCost: 0, atRetail: 0 };

  return res.status(200).json({
    success: true,
    analytics: {
      ...rangeMeta(period),
      financials: {
        totalRevenue: summary.revenue,
        grossSales: summary.grossSales,
        refunds: summary.refunds,
        taxTotal: summary.tax,
        discountTotal: summary.discount,
        netRevenue: summary.netRevenue,
        totalCOGS: summary.cogs,
        grossProfit: summary.grossProfit,
        profitMargin: summary.profitMargin,
        totalOrders: summary.orders,
        avgTicket: summary.avgTicket,
        creditOutstanding: summary.creditOutstanding,
      },
      paymentMethods,
      dailyTrend: rangeTrend,
      trends,
      topMedicines,
      comparison: buildComparison(summary, prevSummary),
      expiryRisk: {
        expiringBatchesCount: expiry.count || 0,
        riskValueCost: round2(expiry.atCost),
        riskValueRetail: round2(expiry.atRetail),
      },
    },
  });
};

// @desc    Profit by medicine or by category, using actual cost per sold unit
//          (items.costPrice, else batch purchase price, else medicine cost price).
// @route   GET /api/reports/profit?groupBy=medicine|category&range...
// @access  Private (reports:view)
const getProfitReport = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, 'monthly');
  const periodFrom = period.range === 'all' ? null : period.from;
  const groupBy = req.query.groupBy === 'category' ? 'category' : 'medicine';

  const [rows, returns] = await Promise.all([
    Sale.aggregate([
      { $match: saleMatch(pharmacyId, periodFrom, period.to) },
      ...itemCostStages(),
      {
        $group: {
          _id: '$items.medicineId',
          name: { $first: { $ifNull: [{ $first: '$_med.name' }, '$items.name'] } },
          category: { $first: { $ifNull: [{ $first: '$_med.category' }, 'Uncategorized'] } },
          unitsSold: { $sum: { $ifNull: ['$items.quantity', 0] } },
          revenue: { $sum: '$_lineNet' },
          cogs: { $sum: '$_lineCost' },
          orders: { $addToSet: '$_id' },
        },
      },
      { $project: { name: 1, category: 1, unitsSold: 1, revenue: 1, cogs: 1, orders: { $size: '$orders' } } },
    ]).option({ allowDiskUse: true }),
    getReturnTotals(pharmacyId, periodFrom, period.to),
  ]);

  const byMed = new Map();
  rows.forEach((r) => {
    byMed.set(String(r._id), {
      id: String(r._id),
      name: r.name,
      category: r.category,
      unitsSold: r.unitsSold || 0,
      orders: r.orders || 0,
      revenue: r.revenue || 0,
      cogs: r.cogs || 0,
      returnedUnits: 0,
      refunds: 0,
    });
  });
  returns.byMedicine.forEach((ret, id) => {
    const e = byMed.get(id) || {
      id, name: ret.name, category: ret.category, unitsSold: 0, orders: 0, revenue: 0, cogs: 0, returnedUnits: 0, refunds: 0,
    };
    e.returnedUnits += ret.quantity || 0;
    e.refunds += ret.refund || 0;
    e.revenue -= ret.refund || 0;
    e.cogs -= ret.restockedCost || 0;
    byMed.set(id, e);
  });

  let list = [...byMed.values()];
  if (groupBy === 'category') {
    const cats = new Map();
    list.forEach((m) => {
      const key = m.category || 'Uncategorized';
      const c = cats.get(key) || {
        id: key, name: key, category: key, medicines: 0, unitsSold: 0, orders: 0, revenue: 0, cogs: 0, returnedUnits: 0, refunds: 0,
      };
      c.medicines += 1;
      c.unitsSold += m.unitsSold;
      c.orders += m.orders;
      c.revenue += m.revenue;
      c.cogs += m.cogs;
      c.returnedUnits += m.returnedUnits;
      c.refunds += m.refunds;
      cats.set(key, c);
    });
    list = [...cats.values()];
  }

  const shaped = list
    .map((r) => {
      const profit = r.revenue - r.cogs;
      return {
        ...r,
        unitsSold: r.unitsSold - r.returnedUnits,
        revenue: round2(r.revenue),
        cogs: round2(r.cogs),
        refunds: round2(r.refunds),
        profit: round2(profit),
        marginPct: r.revenue > 0 ? Number(((profit / r.revenue) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  const totals = shaped.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, cogs: t.cogs + r.cogs, profit: t.profit + r.profit, unitsSold: t.unitsSold + r.unitsSold }),
    { revenue: 0, cogs: 0, profit: 0, unitsSold: 0 }
  );

  return res.status(200).json({
    success: true,
    report: {
      ...rangeMeta(period),
      groupBy,
      rows: shaped,
      totals: {
        revenue: round2(totals.revenue),
        cogs: round2(totals.cogs),
        profit: round2(totals.profit),
        unitsSold: totals.unitsSold,
        marginPct: totals.revenue > 0 ? Number(((totals.profit / totals.revenue) * 100).toFixed(1)) : 0,
      },
    },
  });
};

// @desc    Sales per staff member (staffId, falling back to pharmacistId)
// @route   GET /api/reports/sales-by-staff?range...
// @access  Private (reports:view)
const getSalesByStaff = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, 'monthly');
  const periodFrom = period.range === 'all' ? null : period.from;

  const [rows, returns] = await Promise.all([
    Sale.aggregate([
      { $match: saleMatch(pharmacyId, periodFrom, period.to) },
      {
        $group: {
          _id: { $ifNull: ['$staffId', '$pharmacistId'] },
          orders: { $sum: 1 },
          revenue: { $sum: '$grandTotal' },
          discount: { $sum: { $ifNull: ['$discount', 0] } },
          tax: { $sum: { $ifNull: ['$tax', 0] } },
          items: { $sum: { $size: { $ifNull: ['$items', []] } } },
          firstSale: { $min: '$createdAt' },
          lastSale: { $max: '$createdAt' },
        },
      },
      {
        $lookup: {
          from: User.collection.name,
          localField: '_id',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, email: 1 } }],
          as: 'user',
        },
      },
    ]),
    getReturnTotals(pharmacyId, periodFrom, period.to),
  ]);

  const shaped = rows
    .map((r) => {
      const ret = returns.bySaleStaff.get(String(r._id));
      const refunds = ret?.refunds || 0;
      return {
        staffId: r._id,
        name: r.user?.[0]?.name || 'Unknown user',
        email: r.user?.[0]?.email || '',
        orders: r.orders,
        items: r.items,
        revenue: round2(r.revenue),
        refunds: round2(refunds),
        netRevenue: round2(r.revenue - refunds),
        discount: round2(r.discount),
        tax: round2(r.tax),
        avgTicket: r.orders ? round2(r.revenue / r.orders) : 0,
        firstSale: r.firstSale,
        lastSale: r.lastSale,
      };
    })
    .sort((a, b) => b.netRevenue - a.netRevenue);

  return res.status(200).json({ success: true, report: { ...rangeMeta(period), rows: shaped } });
};

// @desc    Sales per cash-register shift (sales without a shift are grouped as "No shift")
// @route   GET /api/reports/sales-by-shift?range...
// @access  Private (reports:view)
const getSalesByShift = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, 'monthly');
  const periodFrom = period.range === 'all' ? null : period.from;
  // Shift model is built by the POS agent; $lookup on an empty collection is harmless.
  const shiftCollection = mongoose.models.Shift ? mongoose.models.Shift.collection.name : 'shifts';

  const [rows, returns] = await Promise.all([
    Sale.aggregate([
      { $match: saleMatch(pharmacyId, periodFrom, period.to) },
      {
        $group: {
          _id: '$shiftId',
          orders: { $sum: 1 },
          revenue: { $sum: '$grandTotal' },
          staffIds: { $addToSet: { $ifNull: ['$staffId', '$pharmacistId'] } },
          firstSale: { $min: '$createdAt' },
          lastSale: { $max: '$createdAt' },
        },
      },
      {
        $lookup: {
          from: shiftCollection,
          localField: '_id',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                shiftNumber: 1, status: 1, openedAt: 1, closedAt: 1, userId: 1, openedBy: 1,
                openingFloat: 1, expectedCash: 1, countedCash: 1, variance: 1,
              },
            },
          ],
          as: 'shift',
        },
      },
      {
        $lookup: {
          from: User.collection.name,
          localField: 'staffIds',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1 } }],
          as: 'staff',
        },
      },
      { $sort: { firstSale: -1 } },
    ]),
    getReturnTotals(pharmacyId, periodFrom, period.to),
  ]);

  const shaped = rows.map((r) => {
    const shift = r.shift?.[0] || null;
    const refunds = returns.bySaleShift.get(String(r._id))?.refunds || 0;
    return {
      shiftId: r._id || null,
      label: r._id ? shift?.shiftNumber || `Shift ${String(r._id).slice(-6)}` : 'No shift',
      status: shift?.status || (r._id ? 'unknown' : null),
      openedAt: shift?.openedAt || r.firstSale,
      closedAt: shift?.closedAt || null,
      staff: (r.staff || []).map((u) => u.name),
      orders: r.orders,
      revenue: round2(r.revenue),
      refunds: round2(refunds),
      netRevenue: round2(r.revenue - refunds),
      variance: shift?.variance ?? null,
      firstSale: r.firstSale,
      lastSale: r.lastSale,
    };
  });

  return res.status(200).json({ success: true, report: { ...rangeMeta(period), rows: shaped } });
};

// @desc    Slow-moving and dead stock: medicines in stock with no sales (dead)
//          or very low sales (slow) during the last N days, with stock value.
// @route   GET /api/reports/slow-moving?days=90&status=all|dead|slow
// @access  Private (reports:view)
const getSlowMovingStock = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const days = req.query.days === undefined ? 90 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new AppError('days must be a whole number between 1 and 3650', 400);
  }
  const statusFilter = ['dead', 'slow'].includes(req.query.status) ? req.query.status : 'all';
  const cutoff = new Date(Date.now() - days * DAY_MS);

  const [stockRows, salesRows] = await Promise.all([
    Medicine.aggregate([
      { $match: { pharmacyId, isArchived: { $ne: true } } },
      { $project: { name: 1, category: 1, price: 1, costPrice: 1 } },
      {
        $lookup: {
          from: StockBatch.collection.name,
          localField: '_id',
          foreignField: 'medicineId',
          let: { medCost: '$costPrice' },
          pipeline: [
            { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 } } },
            {
              $group: {
                _id: null,
                qty: { $sum: '$quantity' },
                batches: { $sum: 1 },
                value: {
                  $sum: {
                    $multiply: [
                      '$quantity',
                      { $cond: [{ $gt: [{ $ifNull: ['$purchasePrice', 0] }, 0] }, '$purchasePrice', { $ifNull: ['$$medCost', 0] }] },
                    ],
                  },
                },
                oldestReceived: { $min: '$createdAt' },
                nearestExpiry: { $min: '$expiryDate' },
              },
            },
          ],
          as: 'stock',
        },
      },
      { $addFields: { stock: { $first: '$stock' } } },
      { $match: { 'stock.qty': { $gt: 0 } } },
    ]),
    Sale.aggregate([
      { $match: { pharmacyId, voided: { $ne: true } } },
      { $project: { createdAt: 1, items: { medicineId: 1, quantity: 1 } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.medicineId',
          lastSoldAt: { $max: '$createdAt' },
          unitsInWindow: { $sum: { $cond: [{ $gte: ['$createdAt', cutoff] }, '$items.quantity', 0] } },
        },
      },
    ]).option({ allowDiskUse: true }),
  ]);

  const salesMap = new Map(salesRows.map((r) => [String(r._id), r]));
  const now = Date.now();
  const rows = [];
  stockRows.forEach((m) => {
    const sale = salesMap.get(String(m._id));
    const lastSoldAt = sale?.lastSoldAt || null;
    const unitsInWindow = sale?.unitsInWindow || 0;
    const qty = m.stock.qty;
    let status = null;
    let coverDays = null;
    if (!lastSoldAt || lastSoldAt < cutoff) {
      status = 'dead';
    } else {
      coverDays = Math.round(qty / (unitsInWindow / days));
      // Slow: current stock lasts more than 3x the window at the recent sales rate
      if (coverDays > days * 3) status = 'slow';
    }
    if (!status || (statusFilter !== 'all' && status !== statusFilter)) return;
    rows.push({
      medicineId: m._id,
      name: m.name,
      category: m.category,
      status,
      quantity: qty,
      batches: m.stock.batches,
      stockValue: round2(m.stock.value),
      retailValue: round2(qty * (m.price || 0)),
      lastSoldAt,
      daysSinceLastSale: lastSoldAt ? Math.floor((now - new Date(lastSoldAt).getTime()) / DAY_MS) : null,
      unitsSoldInWindow: unitsInWindow,
      coverDays,
      nearestExpiry: m.stock.nearestExpiry,
      oldestReceived: m.stock.oldestReceived,
    });
  });
  rows.sort((a, b) => b.stockValue - a.stockValue);

  const summary = rows.reduce(
    (s, r) => {
      s[r.status].count += 1;
      s[r.status].stockValue = round2(s[r.status].stockValue + r.stockValue);
      return s;
    },
    { dead: { count: 0, stockValue: 0 }, slow: { count: 0, stockValue: 0 } }
  );

  return res.status(200).json({ success: true, report: { days, status: statusFilter, summary, rows } });
};

const EXPIRE_MOVEMENTS = ['expire', 'adjust_expired'];

// @desc    Expiry loss: value (at cost) of stock written off as expired, by month,
//          plus expired stock still on the shelf (not yet written off).
// @route   GET /api/reports/expiry-loss?range=yearly...
// @access  Private (reports:view)
const getExpiryLoss = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, 'yearly');
  const { timeZone } = period;
  const periodFrom = period.range === 'all' ? null : period.from;
  const dateMatch = {};
  if (periodFrom) dateMatch.$gte = periodFrom;
  dateMatch.$lt = period.to;

  const costStages = [
    {
      $lookup: {
        from: StockBatch.collection.name,
        localField: 'batchId',
        foreignField: '_id',
        pipeline: [{ $project: { purchasePrice: 1, batchNo: 1 } }],
        as: '_batch',
      },
    },
    {
      $lookup: {
        from: Medicine.collection.name,
        localField: 'medicineId',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, costPrice: 1 } }],
        as: '_med',
      },
    },
    {
      $addFields: {
        _units: { $abs: '$quantityChange' },
        _unitCost: {
          $cond: [
            { $gt: [{ $ifNull: [{ $first: '$_batch.purchasePrice' }, 0] }, 0] },
            { $first: '$_batch.purchasePrice' },
            { $ifNull: [{ $first: '$_med.costPrice' }, 0] },
          ],
        },
      },
    },
    { $addFields: { _value: { $multiply: ['$_units', '$_unitCost'] } } },
  ];

  const [movementFacet, writtenOffBatchIds, onShelf] = await Promise.all([
    StockMovement.aggregate([
      { $match: { pharmacyId, type: { $in: EXPIRE_MOVEMENTS }, quantityChange: { $lt: 0 }, createdAt: dateMatch } },
      ...costStages,
      {
        $facet: {
          byMonth: [
            {
              $group: {
                _id: localMonthExpr('$createdAt', timeZone),
                units: { $sum: '$_units' },
                value: { $sum: '$_value' },
                batches: { $addToSet: '$batchId' },
              },
            },
            { $project: { units: 1, value: 1, batches: { $size: '$batches' } } },
            { $sort: { _id: 1 } },
          ],
          byMedicine: [
            {
              $group: {
                _id: '$medicineId',
                name: { $first: { $first: '$_med.name' } },
                units: { $sum: '$_units' },
                value: { $sum: '$_value' },
              },
            },
            { $sort: { value: -1 } },
            { $limit: 20 },
          ],
        },
      },
    ]),
    StockMovement.distinct('batchId', { pharmacyId, type: { $in: EXPIRE_MOVEMENTS } }),
    StockBatch.aggregate([
      { $match: { pharmacyId, quantity: { $gt: 0 }, expiryDate: { $lt: new Date() }, status: { $in: ['active', 'expired'] } } },
      {
        $lookup: {
          from: Medicine.collection.name,
          localField: 'medicineId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, costPrice: 1 } }],
          as: '_med',
        },
      },
      {
        $group: {
          _id: null,
          batches: { $sum: 1 },
          units: { $sum: '$quantity' },
          value: {
            $sum: {
              $multiply: [
                '$quantity',
                {
                  $cond: [
                    { $gt: [{ $ifNull: ['$purchasePrice', 0] }, 0] },
                    '$purchasePrice',
                    { $ifNull: [{ $first: '$_med.costPrice' }, 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]),
  ]);

  // Batches marked 'expired' without any expire movement (e.g. legacy data):
  // count their expiry month using the quantity they were marked with.
  const statusOnly = await StockBatch.aggregate([
    {
      $match: {
        pharmacyId,
        status: 'expired',
        expiryDate: dateMatch,
        _id: { $nin: writtenOffBatchIds },
        quantity: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: localMonthExpr('$expiryDate', timeZone),
        units: { $sum: '$quantity' },
        value: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
        batches: { $sum: 1 },
      },
    },
  ]);

  const months = new Map();
  [...(movementFacet[0]?.byMonth || []), ...statusOnly].forEach((r) => {
    const m = months.get(r._id) || { month: r._id, units: 0, value: 0, batches: 0 };
    m.units += r.units || 0;
    m.value += r.value || 0;
    m.batches += r.batches || 0;
    months.set(r._id, m);
  });
  const byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, value: round2(m.value) }));
  const shelf = onShelf[0] || { batches: 0, units: 0, value: 0 };

  return res.status(200).json({
    success: true,
    report: {
      ...rangeMeta(period),
      byMonth,
      byMedicine: (movementFacet[0]?.byMedicine || []).map((r) => ({
        medicineId: r._id, name: r.name || 'Unknown', units: r.units, value: round2(r.value),
      })),
      totals: {
        units: byMonth.reduce((s, m) => s + m.units, 0),
        value: round2(byMonth.reduce((s, m) => s + m.value, 0)),
        batches: byMonth.reduce((s, m) => s + m.batches, 0),
      },
      expiredOnShelf: { batches: shelf.batches, units: shelf.units, value: round2(shelf.value) },
    },
  });
};

// @desc    Tax / VAT summary per day or month, from sale.taxLines
// @route   GET /api/reports/tax-summary?range...&groupBy=day|month
// @access  Private (reports:view)
const getTaxSummary = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, 'monthly');
  const { timeZone } = period;
  const periodFrom = period.range === 'all' ? null : period.from;
  let groupBy = req.query.groupBy;
  if (!['day', 'month'].includes(groupBy)) {
    groupBy = period.range === 'all' || period.to - period.from > 62 * DAY_MS ? 'month' : 'day';
  }
  const periodExpr = groupBy === 'month' ? localMonthExpr('$createdAt', timeZone) : localDayExpr('$createdAt', timeZone);

  const [facet] = await Sale.aggregate([
    { $match: saleMatch(pharmacyId, periodFrom, period.to) },
    {
      $facet: {
        lines: [
          { $unwind: '$taxLines' },
          {
            $group: {
              _id: { period: periodExpr, name: '$taxLines.name', rate: '$taxLines.rate' },
              amount: { $sum: '$taxLines.amount' },
              sales: { $addToSet: '$_id' },
            },
          },
          { $project: { amount: 1, sales: { $size: '$sales' } } },
          { $sort: { '_id.period': 1 } },
        ],
        periods: [
          {
            $group: {
              _id: periodExpr,
              sales: { $sum: 1 },
              grossSales: { $sum: '$grandTotal' },
              tax: { $sum: { $ifNull: ['$tax', 0] } },
              taxableSales: {
                $sum: { $cond: [{ $gt: [{ $ifNull: ['$tax', 0] }, 0] }, { $subtract: ['$grandTotal', '$tax'] }, 0] },
              },
              // Tax typed in manually (no taxLines), e.g. older sales
              untrackedTax: {
                $sum: {
                  $cond: [{ $eq: [{ $size: { $ifNull: ['$taxLines', []] } }, 0] }, { $ifNull: ['$tax', 0] }, 0],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const byRate = new Map();
  (facet?.lines || []).forEach((l) => {
    const key = `${l._id.name}|${l._id.rate}`;
    const r = byRate.get(key) || { name: l._id.name, rate: l._id.rate, amount: 0, sales: 0 };
    r.amount += l.amount || 0;
    r.sales += l.sales || 0;
    byRate.set(key, r);
  });

  const periods = (facet?.periods || []).map((p) => ({
    period: p._id,
    sales: p.sales,
    grossSales: round2(p.grossSales),
    taxableSales: round2(p.taxableSales),
    tax: round2(p.tax),
    untrackedTax: round2(p.untrackedTax),
    lines: (facet?.lines || [])
      .filter((l) => l._id.period === p._id)
      .map((l) => ({ name: l._id.name, rate: l._id.rate, amount: round2(l.amount) })),
  }));

  return res.status(200).json({
    success: true,
    report: {
      ...rangeMeta(period),
      groupBy,
      periods,
      byRate: [...byRate.values()].map((r) => ({ ...r, amount: round2(r.amount) })),
      totals: {
        tax: round2(periods.reduce((s, p) => s + p.tax, 0)),
        taxableSales: round2(periods.reduce((s, p) => s + p.taxableSales, 0)),
        grossSales: round2(periods.reduce((s, p) => s + p.grossSales, 0)),
        untrackedTax: round2(periods.reduce((s, p) => s + p.untrackedTax, 0)),
      },
    },
  });
};

// @desc    Current period vs previous period with % change
// @route   GET /api/reports/comparison?range=monthly...
// @access  Private (reports:view)
const getPeriodComparison = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, 'monthly');
  if (period.range === 'all') throw new AppError('Comparison needs a bounded range', 400);
  const [current, previous] = await Promise.all([
    getPeriodSummary(pharmacyId, period.from, period.to),
    getPeriodSummary(pharmacyId, period.prevFrom, period.prevTo),
  ]);
  return res.status(200).json({
    success: true,
    report: { ...rangeMeta(period), current, previous, comparison: buildComparison(current, previous) },
  });
};

module.exports = {
  getFinancialAnalytics,
  getDashboardOverview,
  getProfitReport,
  getSalesByStaff,
  getSalesByShift,
  getSlowMovingStock,
  getExpiryLoss,
  getTaxSummary,
  getPeriodComparison,
  // exported for tests / other modules
  parseRange,
  getPeriodSummary,
};
