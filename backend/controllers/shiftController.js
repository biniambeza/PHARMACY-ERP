// Cash drawer shifts and Z-reports (#7). Owner: POS agent.
const mongoose = require('mongoose');
const Shift = require('../models/Shift');
const Sale = require('../models/Sale');
const Return = require('../models/Return');
const CustomerPayment = require('../models/CustomerPayment');
const AppError = require('../utils/AppError');
const { can } = require('../config/permissions');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { audit } = require('../utils/audit');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const METHODS = ['cash', 'card', 'mobile_money', 'credit'];
const COUNTED = ['cash', 'card', 'mobile_money'];

const canManage = (req) => req.user?.role === 'admin' || can(req.membershipRole, 'shift:manage');

const toMoneyInput = (v, label) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new AppError(`${label} must be a non-negative number`, 400);
  if (n > 1e9) throw new AppError(`${label} is too large`, 400);
  return round2(n);
};

const cleanNotes = (v) => (typeof v === 'string' ? v.trim().slice(0, 1000) : '');

const zeroMethods = () => Object.fromEntries(METHODS.map((m) => [m, 0]));

// Totals of a shift up to `until` (now for an open shift, closedAt for a closed one).
const computeShiftTotals = async (shift, until = new Date()) => {
  const pharmacyId = new mongoose.Types.ObjectId(String(shift.pharmacyId));
  const userId = new mongoose.Types.ObjectId(String(shift.userId?._id || shift.userId));
  const window = { $gte: shift.openedAt, $lte: until };

  const [salesFacet] = await Sale.aggregate([
    { $match: { pharmacyId, shiftId: shift._id } },
    {
      $facet: {
        totals: [
          { $match: { voided: { $ne: true } } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              subtotal: { $sum: '$subtotal' },
              discount: { $sum: '$discount' },
              tax: { $sum: '$tax' },
              grandTotal: { $sum: '$grandTotal' },
              change: { $sum: { $ifNull: ['$change', 0] } },
            },
          },
        ],
        voided: [
          { $match: { voided: true } },
          { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$grandTotal' } } },
        ],
        payments: [
          { $match: { voided: { $ne: true } } },
          {
            $project: {
              pays: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ['$payments', []] } }, 0] },
                  '$payments',
                  [{ method: { $ifNull: ['$paymentMethod', 'cash'] }, amount: '$grandTotal', status: 'completed' }],
                ],
              },
            },
          },
          { $unwind: '$pays' },
          { $match: { 'pays.status': { $nin: ['failed', 'refunded', 'pending'] } } },
          { $group: { _id: '$pays.method', total: { $sum: '$pays.amount' }, count: { $sum: 1 } } },
        ],
        topItems: [
          { $match: { voided: { $ne: true } } },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.medicineId',
              name: { $first: '$items.name' },
              quantity: { $sum: '$items.quantity' },
              total: { $sum: '$items.subtotal' },
            },
          },
          { $sort: { total: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  const [customerPayments, refunds] = await Promise.all([
    CustomerPayment.aggregate([
      { $match: { pharmacyId, receivedBy: userId, createdAt: window } },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Return.aggregate([
      { $match: { pharmacyId, processedBy: userId, createdAt: window } },
      {
        $group: {
          _id: '$refundMethod',
          // Money actually handed back (credit reversals are not paid out)
          total: {
            $sum: {
              $ifNull: ['$refundDue', { $subtract: ['$refundTotal', { $ifNull: ['$creditReversed', 0] }] }],
            },
          },
          refundTotal: { $sum: '$refundTotal' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const salesByMethod = zeroMethods();
  (salesFacet?.payments || []).forEach((r) => {
    salesByMethod[r._id || 'cash'] = round2((salesByMethod[r._id || 'cash'] || 0) + r.total);
  });
  const custByMethod = {};
  customerPayments.forEach((r) => {
    custByMethod[r._id || 'cash'] = round2(r.total);
  });
  const refundsByMethod = {};
  refunds.forEach((r) => {
    refundsByMethod[r._id || 'cash'] = round2(r.total);
  });

  const openingFloat = round2(shift.openingFloat || 0);
  const expected = {
    cashSales: salesByMethod.cash,
    customerPaymentsCash: custByMethod.cash || 0,
    refundsCash: refundsByMethod.cash || 0,
    cash: round2(openingFloat + salesByMethod.cash + (custByMethod.cash || 0) - (refundsByMethod.cash || 0)),
    card: round2(salesByMethod.card + (custByMethod.card || 0) - (refundsByMethod.card || 0)),
    mobile_money: round2(
      salesByMethod.mobile_money + (custByMethod.mobile_money || 0) - (refundsByMethod.mobile_money || 0)
    ),
    credit: salesByMethod.credit,
  };

  const t = salesFacet?.totals?.[0] || {};
  const v = salesFacet?.voided?.[0] || {};
  const report = {
    sales: {
      count: t.count || 0,
      subtotal: round2(t.subtotal || 0),
      discount: round2(t.discount || 0),
      tax: round2(t.tax || 0),
      total: round2(t.grandTotal || 0),
      changeGiven: round2(t.change || 0),
    },
    voids: { count: v.count || 0, total: round2(v.total || 0) },
    returns: {
      count: refunds.reduce((s, r) => s + r.count, 0),
      refundTotal: round2(refunds.reduce((s, r) => s + r.refundTotal, 0)),
      paidOutByMethod: refundsByMethod,
    },
    paymentsByMethod: salesByMethod,
    customerPayments: {
      count: customerPayments.reduce((s, r) => s + r.count, 0),
      byMethod: custByMethod,
    },
    topItems: (salesFacet?.topItems || []).map((i) => ({
      medicineId: i._id,
      name: i.name,
      quantity: i.quantity,
      total: round2(i.total),
    })),
  };

  return { expected, report };
};

const buildZReport = (shift, totals, { generatedAt = new Date() } = {}) => ({
  shiftNumber: shift.shiftNumber,
  status: shift.status,
  cashier: shift.userId && shift.userId.name ? { _id: shift.userId._id, name: shift.userId.name } : { _id: shift.userId },
  openedAt: shift.openedAt,
  closedAt: shift.closedAt,
  openingFloat: round2(shift.openingFloat || 0),
  ...totals.report,
  expected: totals.expected,
  counted: shift.status === 'closed' ? shift.counted : null,
  variance: shift.status === 'closed' ? shift.variance : null,
  generatedAt,
});

const loadShift = async (req, id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Shift not found', 404);
  const shift = await Shift.findOne({ _id: id, pharmacyId: req.pharmacyId })
    .populate('userId', 'name email')
    .populate('closedBy', 'name email');
  if (!shift) throw new AppError('Shift not found', 404);
  const ownerId = String(shift.userId?._id || shift.userId);
  if (!canManage(req) && ownerId !== String(req.user._id)) {
    throw new AppError('Shift not found', 404);
  }
  return shift;
};

// Shift as JSON; open shifts get live expected totals.
const withLive = async (shift) => {
  const json = shift.toObject();
  if (shift.status === 'open') {
    const totals = await computeShiftTotals(shift);
    json.expected = totals.expected;
    json.live = totals.report;
  }
  return json;
};

// @route POST /api/shifts/open  { openingFloat, notes }
const openShift = async (req, res) => {
  const openingFloat = toMoneyInput(req.body?.openingFloat, 'Opening float');
  const existing = await Shift.findOne({ pharmacyId: req.pharmacyId, userId: req.user._id, status: 'open' });
  if (existing) throw new AppError(`You already have an open shift (${existing.shiftNumber})`, 400);

  const session = await mongoose.startSession();
  let shift;
  try {
    await session.withTransaction(async () => {
      const seq = await nextSequence(req.pharmacyId, 'shift', { session });
      [shift] = await Shift.create(
        [
          {
            pharmacyId: req.pharmacyId,
            shiftNumber: formatSequence('SH', seq),
            userId: req.user._id,
            status: 'open',
            openedAt: new Date(),
            openingFloat,
            openingNotes: cleanNotes(req.body?.notes),
          },
        ],
        { session }
      );
    });
  } catch (err) {
    if (err && err.code === 11000) throw new AppError('You already have an open shift', 400);
    throw err;
  } finally {
    await session.endSession();
  }

  await audit(req, {
    action: 'shift.open',
    entity: 'Shift',
    entityId: shift._id,
    meta: { shiftNumber: shift.shiftNumber, openingFloat },
  });

  const populated = await Shift.findById(shift._id).populate('userId', 'name email');
  return res.status(201).json({ success: true, message: 'Shift opened', shift: await withLive(populated) });
};

// @route GET /api/shifts/current
const getCurrentShift = async (req, res) => {
  const shift = await Shift.findOne({ pharmacyId: req.pharmacyId, userId: req.user._id, status: 'open' })
    .populate('userId', 'name email');
  const requireShift = Boolean(req.pharmacy?.settings?.requireShift === true);
  return res.status(200).json({
    success: true,
    requireShift,
    shift: shift ? await withLive(shift) : null,
  });
};

// @route POST /api/shifts/:id/close  { counted: { cash, card, mobile_money }, notes }
const closeShift = async (req, res) => {
  const shift = await loadShift(req, req.params.id);
  if (shift.status !== 'open') throw new AppError('Shift is already closed', 400);

  const countedIn = req.body?.counted || {};
  if (typeof countedIn !== 'object' || Array.isArray(countedIn)) throw new AppError('counted must be an object', 400);
  const counted = Object.fromEntries(COUNTED.map((m) => [m, toMoneyInput(countedIn[m], `Counted ${m.replace('_', ' ')}`)]));

  const closedAt = new Date();
  const totals = await computeShiftTotals(shift, closedAt);
  const variance = Object.fromEntries(COUNTED.map((m) => [m, round2(counted[m] - totals.expected[m])]));

  shift.status = 'closed';
  shift.closedAt = closedAt;
  const zReport = buildZReport(shift, totals, { generatedAt: closedAt });
  zReport.counted = counted;
  zReport.variance = variance;
  zReport.closedBy = { _id: req.user._id, name: req.user.name };

  const updated = await Shift.findOneAndUpdate(
    { _id: shift._id, pharmacyId: req.pharmacyId, status: 'open' },
    {
      $set: {
        status: 'closed',
        closedAt,
        closedBy: req.user._id,
        expected: totals.expected,
        counted,
        variance,
        notes: cleanNotes(req.body?.notes),
        zReport,
      },
    },
    { returnDocument: 'after' }
  )
    .populate('userId', 'name email')
    .populate('closedBy', 'name email');
  if (!updated) throw new AppError('Shift is already closed', 400);

  await audit(req, {
    action: 'shift.close',
    entity: 'Shift',
    entityId: shift._id,
    meta: { shiftNumber: shift.shiftNumber, expected: totals.expected, counted, variance },
  });

  return res.status(200).json({ success: true, message: 'Shift closed', shift: updated, zReport });
};

// @route GET /api/shifts?status=&userId=&from=&to=&page=&limit=
// shift:manage sees every shift of the pharmacy; shift:own only their own.
const getShifts = async (req, res) => {
  const query = { pharmacyId: req.pharmacyId };
  if (canManage(req)) {
    if (typeof req.query.userId === 'string' && mongoose.isValidObjectId(req.query.userId)) {
      query.userId = req.query.userId;
    }
  } else {
    query.userId = req.user._id;
  }
  if (['open', 'closed'].includes(req.query.status)) query.status = req.query.status;
  const range = {};
  if (req.query.from) {
    const d = new Date(req.query.from);
    if (!Number.isNaN(d.getTime())) range.$gte = d;
  }
  if (req.query.to) {
    const d = new Date(req.query.to);
    if (!Number.isNaN(d.getTime())) range.$lte = d;
  }
  if (Object.keys(range).length) query.openedAt = range;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [total, shifts] = await Promise.all([
    Shift.countDocuments(query),
    Shift.find(query)
      .select('-zReport')
      .populate('userId', 'name email')
      .populate('closedBy', 'name')
      .sort({ openedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);
  return res.status(200).json({ success: true, total, page, limit, canManage: canManage(req), shifts });
};

// @route GET /api/shifts/:id
const getShift = async (req, res) => {
  const shift = await loadShift(req, req.params.id);
  return res.status(200).json({ success: true, shift: await withLive(shift) });
};

// @route GET /api/shifts/:id/z-report  (snapshot for closed shifts, live X-report for open ones)
const getZReport = async (req, res) => {
  const shift = await loadShift(req, req.params.id);
  if (shift.status === 'closed' && shift.zReport) {
    return res.status(200).json({ success: true, live: false, zReport: shift.zReport });
  }
  const totals = await computeShiftTotals(shift, shift.closedAt || new Date());
  return res.status(200).json({ success: true, live: shift.status === 'open', zReport: buildZReport(shift, totals) });
};

module.exports = { openShift, getCurrentShift, closeShift, getShifts, getShift, getZReport, computeShiftTotals };
