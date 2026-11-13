const mongoose = require('mongoose');
const Sale = require('../../models/Sale');
const User = require('../../models/User');
const { DAY_MS, toObjectId, round2, localDayExpr, localMonthExpr, parseRange } = require('./helpers');
const { saleMatch, getReturnTotals, rangeMeta } = require('./aggregates');

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

module.exports = {
  getSalesByStaff,
  getSalesByShift,
  getTaxSummary,
};
