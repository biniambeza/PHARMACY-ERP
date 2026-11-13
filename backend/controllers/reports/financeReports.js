const Sale = require('../../models/Sale');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const AppError = require('../../utils/AppError');
const { DAY_MS, toObjectId, round2, getLocalDateString, getLocalDayName, getLocalMonthDay, parseRange } = require('./helpers');
const { saleMatch, itemCostStages, getReturnTotals, getPeriodSummary, buildComparison, getDailySales, getPaymentBreakdown, buildRangeTrend, rangeMeta } = require('./aggregates');

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
    // row.revenue is net of tax: take returns off net of tax too
    const revenue = (row.revenue || 0) - (ret?.net || 0);
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
    // Revenue here is net of tax (and includes any insurer share): returns come off the same way
    e.returnedUnits += ret.quantity || 0;
    e.refunds += ret.net || 0;
    e.revenue -= ret.net || 0;
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
  getProfitReport,
  getPeriodComparison,
};
