const mongoose = require('mongoose');
const Sale = require('../../models/Sale');
const User = require('../../models/User');
const { DAY_MS, toObjectId, round2, localDayExpr, localMonthExpr, parseReportRange, periodStart, getLocalDateString, REPORT_AGG_OPTS } = require('./helpers');
const { saleMatch, getReturnTotals, loadReturnLines, lineAmountStages, rangeMeta } = require('./aggregates');

// @desc    Sales per staff member (staffId, falling back to pharmacistId)
// @route   GET /api/reports/sales-by-staff?range...
// @access  Private (reports:view)
const getSalesByStaff = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseReportRange(req, 'monthly');
  const periodFrom = periodStart(period);

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
    ]).option(REPORT_AGG_OPTS),
    getReturnTotals(pharmacyId, periodFrom, period.to),
  ]);

  const shaped = rows
    .map((r) => {
      const ret = returns.bySaleStaff.get(String(r._id));
      // Value of returned goods (incl. tax and any insurer share), matching revenue = grandTotal
      const refunds = ret?.gross || 0;
      return {
        staffId: r._id,
        name: r.user?.[0]?.name || 'Unknown user',
        email: r.user?.[0]?.email || '',
        orders: r.orders,
        items: r.items,
        revenue: round2(r.revenue),
        refunds: round2(refunds),
        patientRefunds: round2(ret?.refunds || 0),
        netRevenue: round2(r.revenue - refunds),
        discount: round2(r.discount),
        tax: round2(r.tax - (ret?.tax || 0)),
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
  const period = parseReportRange(req, 'monthly');
  const periodFrom = periodStart(period);
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
    ]).option(REPORT_AGG_OPTS),
    getReturnTotals(pharmacyId, periodFrom, period.to),
  ]);

  const shaped = rows.map((r) => {
    const shift = r.shift?.[0] || null;
    const ret = returns.bySaleShift.get(String(r._id));
    const refunds = ret?.gross || 0;
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
      patientRefunds: round2(ret?.refunds || 0),
      netRevenue: round2(r.revenue - refunds),
      variance: shift?.variance ?? null,
      firstSale: r.firstSale,
      lastSale: r.lastSale,
    };
  });

  return res.status(200).json({ success: true, report: { ...rangeMeta(period), rows: shaped } });
};

// @desc    Tax / VAT summary per day or month, net of returns (by return date)
//          taxableSales = net-of-tax value of lines that carried tax, exemptSales = lines
//          without tax; returns take their own stored tax / base back in the period they
//          were processed (older returns: proportional estimate).
// @route   GET /api/reports/tax-summary?range...&groupBy=day|month
// @access  Private (reports:view)
const getTaxSummary = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseReportRange(req, 'monthly');
  const { timeZone } = period;
  const periodFrom = periodStart(period);
  let groupBy = req.query.groupBy;
  if (!['day', 'month'].includes(groupBy)) {
    groupBy = period.range === 'all' || period.to - period.from > 62 * DAY_MS ? 'month' : 'day';
  }
  const periodExpr = groupBy === 'month' ? localMonthExpr('$createdAt', timeZone) : localDayExpr('$createdAt', timeZone);
  const periodOf = (date) => {
    const day = getLocalDateString(date, timeZone);
    return groupBy === 'month' ? day.slice(0, 7) : day;
  };

  const [[facet], returnData] = await Promise.all([
    Sale.aggregate([
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
                // Tax typed in manually (no taxLines), e.g. older sales
                untrackedTax: {
                  $sum: {
                    $cond: [{ $eq: [{ $size: { $ifNull: ['$taxLines', []] } }, 0] }, { $ifNull: ['$tax', 0] }, 0],
                  },
                },
              },
            },
          ],
          bases: [
            ...lineAmountStages(),
            {
              $group: {
                _id: periodExpr,
                taxableSales: { $sum: { $cond: [{ $gt: ['$_lineTax', 0] }, '$_lineNet', 0] } },
                exemptSales: { $sum: { $cond: [{ $gt: ['$_lineTax', 0] }, 0, '$_lineNet'] } },
              },
            },
          ],
        },
      },
    ]).option(REPORT_AGG_OPTS),
    loadReturnLines(pharmacyId, periodFrom, period.to),
  ]);

  const byPeriod = new Map();
  const get = (p) => {
    if (!byPeriod.has(p)) {
      byPeriod.set(p, {
        period: p,
        sales: 0,
        grossSales: 0,
        taxableSales: 0,
        exemptSales: 0,
        tax: 0,
        untrackedTax: 0,
        returnIds: new Set(),
        returnedGross: 0,
        returnedTaxable: 0,
        returnedExempt: 0,
        returnedTax: 0,
        lines: new Map(),
      });
    }
    return byPeriod.get(p);
  };
  (facet?.periods || []).forEach((p) => {
    const e = get(p._id);
    e.sales = p.sales;
    e.grossSales = p.grossSales || 0;
    e.tax = p.tax || 0;
    e.untrackedTax = p.untrackedTax || 0;
  });
  (facet?.bases || []).forEach((b) => {
    const e = get(b._id);
    e.taxableSales = b.taxableSales || 0;
    e.exemptSales = b.exemptSales || 0;
  });
  const lineKey = (name, rate) => [name, rate].join('|');
  (facet?.lines || []).forEach((l) => {
    const e = get(l._id.period);
    const k = lineKey(l._id.name, l._id.rate);
    const cur = e.lines.get(k) || { name: l._id.name, rate: l._id.rate, amount: 0, sales: 0 };
    cur.amount += l.amount || 0;
    cur.sales += l.sales || 0;
    e.lines.set(k, cur);
  });

  // Returns come off the period in which they were processed
  returnData.lines.forEach((l) => {
    const e = get(periodOf(l.createdAt));
    e.returnIds.add(String(l.returnId));
    e.returnedGross += l.gross;
    e.returnedTax += l.tax;
    if (l.tax > 0) {
      e.returnedTaxable += l.net;
      const k = lineKey(l.taxName, l.taxRate);
      const cur = e.lines.get(k) || { name: l.taxName, rate: l.taxRate, amount: 0, sales: 0 };
      cur.amount -= l.tax;
      e.lines.set(k, cur);
    } else {
      e.returnedExempt += l.net;
    }
  });

  const periods = [...byPeriod.values()]
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))
    .map((e) => ({
      period: e.period,
      sales: e.sales,
      returns: e.returnIds.size,
      // Net of returns
      grossSales: round2(e.grossSales - e.returnedGross),
      taxableSales: round2(e.taxableSales - e.returnedTaxable),
      exemptSales: round2(e.exemptSales - e.returnedExempt),
      tax: round2(e.tax - e.returnedTax),
      untrackedTax: round2(e.untrackedTax),
      // Before returns / taken back by returns
      salesGross: round2(e.grossSales),
      salesTax: round2(e.tax),
      returnedGross: round2(e.returnedGross),
      returnedTaxable: round2(e.returnedTaxable),
      returnedExempt: round2(e.returnedExempt),
      returnedTax: round2(e.returnedTax),
      lines: [...e.lines.values()].map((l) => ({ name: l.name, rate: l.rate, amount: round2(l.amount) })),
    }));

  const byRate = new Map();
  byPeriod.forEach((e) => {
    e.lines.forEach((l, k) => {
      const r = byRate.get(k) || { name: l.name, rate: l.rate, amount: 0, sales: 0 };
      r.amount += l.amount;
      r.sales += l.sales;
      byRate.set(k, r);
    });
  });

  const total = (k) => round2(periods.reduce((s, p) => s + p[k], 0));
  return res.status(200).json({
    success: true,
    report: {
      ...rangeMeta(period),
      groupBy,
      periods,
      byRate: [...byRate.values()].map((r) => ({ ...r, amount: round2(r.amount) })),
      totals: {
        tax: total('tax'),
        taxableSales: total('taxableSales'),
        exemptSales: total('exemptSales'),
        grossSales: total('grossSales'),
        untrackedTax: total('untrackedTax'),
        salesTax: total('salesTax'),
        returnedTax: total('returnedTax'),
        returnedTaxable: total('returnedTaxable'),
        returnedExempt: total('returnedExempt'),
        returnedGross: total('returnedGross'),
      },
    },
  });
};

module.exports = {
  getSalesByStaff,
  getSalesByShift,
  getTaxSummary,
};
