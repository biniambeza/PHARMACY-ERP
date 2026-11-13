const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const AuditLog = require('../models/AuditLog');
const Transfer = require('../models/Transfer');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { createNotification } = require('../services/notify');

const DAY = 24 * 60 * 60 * 1000;
const SUB_STATUSES = ['trial', 'active', 'past_due', 'cancelled'];
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const round = (n) => Math.round((n || 0) * 100) / 100;

const envInt = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

// ----- Subscriptions ------------------------------------------------------------

/**
 * Billing enforcement, meant to run once a day (see the orchestrator's job runner).
 *  1. trial/active subscriptions whose currentPeriodEnd is more than `graceDays`
 *     in the past become `past_due`.
 *  2. active pharmacies whose subscription is past_due or cancelled and whose
 *     currentPeriodEnd is more than `graceDays + suspendAfterDays` in the past
 *     are suspended (Pharmacy.status = 'suspended'; staff can no longer use it).
 * Pharmacies without currentPeriodEnd are never touched. Never throws on a
 * single pharmacy; returns a summary.
 *
 * Options (defaults from env SUBSCRIPTION_GRACE_DAYS=3, SUBSCRIPTION_SUSPEND_AFTER_DAYS=7).
 */
const checkSubscriptions = async ({
  now = new Date(),
  graceDays = envInt('SUBSCRIPTION_GRACE_DAYS', 3),
  suspendAfterDays = envInt('SUBSCRIPTION_SUSPEND_AFTER_DAYS', 7),
} = {}) => {
  const pastDueCutoff = new Date(now.getTime() - graceDays * DAY);
  const suspendCutoff = new Date(now.getTime() - (graceDays + suspendAfterDays) * DAY);

  const toPastDue = await Pharmacy.find({
    status: { $ne: 'archived' },
    'subscription.status': { $in: ['trial', 'active'] },
    'subscription.currentPeriodEnd': { $ne: null, $lt: pastDueCutoff },
  })
    .select('_id name subscription')
    .lean();

  const pastDueIds = [];
  for (const p of toPastDue) {
    const r = await Pharmacy.updateOne(
      { _id: p._id, 'subscription.status': p.subscription.status },
      { $set: { 'subscription.status': 'past_due' } }
    );
    if (r.modifiedCount) {
      pastDueIds.push(p._id);
      await audit(null, {
        action: 'subscription.past_due',
        entity: 'Pharmacy',
        entityId: p._id,
        pharmacyId: p._id,
        userName: 'system',
        meta: { previous: p.subscription.status, currentPeriodEnd: p.subscription.currentPeriodEnd },
      });
    }
  }

  const toSuspend = await Pharmacy.find({
    status: 'active',
    'subscription.status': { $in: ['past_due', 'cancelled'] },
    'subscription.currentPeriodEnd': { $ne: null, $lt: suspendCutoff },
  })
    .select('_id name subscription')
    .lean();

  const suspendedIds = [];
  for (const p of toSuspend) {
    const r = await Pharmacy.updateOne({ _id: p._id, status: 'active' }, { $set: { status: 'suspended' } });
    if (r.modifiedCount) {
      suspendedIds.push(p._id);
      await audit(null, {
        action: 'subscription.suspend',
        entity: 'Pharmacy',
        entityId: p._id,
        pharmacyId: p._id,
        userName: 'system',
        meta: { subscriptionStatus: p.subscription.status, currentPeriodEnd: p.subscription.currentPeriodEnd },
      });
      await createNotification({
        pharmacyId: p._id,
        type: 'pharmacy_suspended',
        severity: 'critical',
        title: 'Pharmacy suspended: subscription unpaid',
        message: `${p.name} was suspended because its subscription is ${String(p.subscription.status).replace('_', ' ')}. Please renew your subscription or contact support.`,
      });
    }
  }

  return {
    checkedAt: now,
    graceDays,
    suspendAfterDays,
    pastDue: pastDueIds.length,
    suspended: suspendedIds.length,
    pastDueIds,
    suspendedIds,
  };
};

// @desc    Subscriptions of every pharmacy
// @route   GET /api/admin/platform/subscriptions
const listSubscriptions = async (req, res) => {
  const pharmacies = await Pharmacy.find({ status: { $ne: 'archived' } })
    .select('name licenseNo status subscription organizationId createdAt')
    .sort({ name: 1 })
    .lean();
  return res.status(200).json({ success: true, pharmacies });
};

// @desc    Set or extend a pharmacy's subscription
// @route   PATCH /api/admin/platform/pharmacies/:id/subscription
//          { plan?, status?, currentPeriodEnd? (date|null), extendDays?, reactivate? }
//          extendDays adds days to max(currentPeriodEnd, now). reactivate=true
//          re-opens a suspended pharmacy.
const updateSubscription = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const { plan, status, currentPeriodEnd, extendDays, reactivate } = req.body || {};
  const pharmacy = await Pharmacy.findById(req.params.id);
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);
  if (pharmacy.status === 'archived') throw new AppError('Archived pharmacies cannot be changed', 400);

  const before = { subscription: pharmacy.subscription?.toObject?.() || pharmacy.subscription, status: pharmacy.status };

  if (plan !== undefined) {
    if (typeof plan !== 'string' || !plan.trim() || plan.trim().length > 50) throw new AppError('Invalid plan', 400);
    pharmacy.subscription.plan = plan.trim();
  }
  if (status !== undefined) {
    if (!SUB_STATUSES.includes(status)) throw new AppError('Invalid subscription status', 400);
    pharmacy.subscription.status = status;
  }
  if (currentPeriodEnd !== undefined) {
    if (currentPeriodEnd === null || currentPeriodEnd === '') {
      pharmacy.subscription.currentPeriodEnd = null;
    } else {
      const d = new Date(currentPeriodEnd);
      if (Number.isNaN(d.getTime())) throw new AppError('Invalid period end date', 400);
      pharmacy.subscription.currentPeriodEnd = d;
    }
  }
  if (extendDays !== undefined) {
    const days = Number(extendDays);
    if (!Number.isInteger(days) || days < 1 || days > 3660) {
      throw new AppError('extendDays must be a whole number between 1 and 3660', 400);
    }
    const current = pharmacy.subscription.currentPeriodEnd;
    const base = current && current > new Date() ? current : new Date();
    pharmacy.subscription.currentPeriodEnd = new Date(base.getTime() + days * DAY);
    // Paying for more time clears a past_due state unless a status was given
    if (status === undefined && pharmacy.subscription.status === 'past_due') {
      pharmacy.subscription.status = 'active';
    }
  }
  const reactivated = reactivate === true && pharmacy.status === 'suspended';
  if (reactivated) pharmacy.status = 'active';

  await pharmacy.save();
  if (reactivated) {
    await createNotification({
      pharmacyId: pharmacy._id,
      type: 'pharmacy_reactivated',
      severity: 'info',
      title: 'Pharmacy reactivated',
      message: `${pharmacy.name} has been reactivated. All features are available again.`,
    });
  }
  await audit(req, {
    action: 'subscription.update',
    entity: 'Pharmacy',
    entityId: pharmacy._id,
    pharmacyId: pharmacy._id,
    before,
    after: { subscription: pharmacy.subscription.toObject(), status: pharmacy.status },
  });

  return res.status(200).json({ success: true, message: 'Subscription updated', pharmacy });
};

// @desc    Run the subscription check now
// @route   POST /api/admin/platform/subscriptions/check
const runSubscriptionCheck = async (req, res) => {
  const result = await checkSubscriptions();
  return res.status(200).json({ success: true, result });
};

// ----- Metrics --------------------------------------------------------------------

// @desc    Platform-wide usage metrics
// @route   GET /api/admin/platform/metrics?months=12
const getPlatformMetrics = async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 36);
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const last30 = new Date(now.getTime() - 30 * DAY);

  const [statusRows, subRows, planRows, salesByMonth, newByMonth, topRows, activeSellers, totalBefore] =
    await Promise.all([
      Pharmacy.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Pharmacy.aggregate([
        { $match: { status: { $ne: 'archived' } } },
        { $group: { _id: '$subscription.status', count: { $sum: 1 } } },
      ]),
      Pharmacy.aggregate([
        { $match: { status: { $ne: 'archived' } } },
        { $group: { _id: '$subscription.plan', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: start }, voided: { $ne: true } } },
        {
          $group: {
            _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } },
            volume: { $sum: '$grandTotal' },
            transactions: { $sum: 1 },
            pharmacies: { $addToSet: '$pharmacyId' },
          },
        },
        { $project: { volume: 1, transactions: 1, activePharmacies: { $size: '$pharmacies' } } },
      ]),
      Pharmacy.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: start }, voided: { $ne: true } } },
        { $group: { _id: '$pharmacyId', volume: { $sum: '$grandTotal' }, transactions: { $sum: 1 } } },
        { $sort: { volume: -1 } },
        { $limit: 10 },
        { $lookup: { from: Pharmacy.collection.name, localField: '_id', foreignField: '_id', as: 'p' } },
        {
          $project: {
            volume: 1,
            transactions: 1,
            name: { $ifNull: [{ $first: '$p.name' }, 'Unknown'] },
            status: { $first: '$p.status' },
          },
        },
      ]),
      Sale.distinct('pharmacyId', { createdAt: { $gte: last30 }, voided: { $ne: true } }),
      Pharmacy.countDocuments({ createdAt: { $lt: start } }),
    ]);

  const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const salesMap = new Map(salesByMonth.map((r) => [key(r._id.y, r._id.m), r]));
  const newMap = new Map(newByMonth.map((r) => [key(r._id.y, r._id.m), r.count]));

  let cumulative = totalBefore;
  let prevVolume = null;
  const series = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const k = key(d.getUTCFullYear(), d.getUTCMonth() + 1);
    const s = salesMap.get(k) || {};
    const volume = round(s.volume);
    const added = newMap.get(k) || 0;
    cumulative += added;
    series.push({
      month: k,
      volume,
      transactions: s.transactions || 0,
      activePharmacies: s.activePharmacies || 0,
      newPharmacies: added,
      totalPharmacies: cumulative,
      growthPercent: prevVolume ? round(((volume - prevVolume) / prevVolume) * 100) : null,
    });
    prevVolume = volume;
  }

  const byStatus = Object.fromEntries(statusRows.map((r) => [r._id, r.count]));
  const thisMonth = series[series.length - 1] || { volume: 0 };
  const lastMonth = series[series.length - 2] || null;

  return res.status(200).json({
    success: true,
    metrics: {
      pharmacies: {
        active: byStatus.active || 0,
        suspended: byStatus.suspended || 0,
        archived: byStatus.archived || 0,
        sellingLast30Days: activeSellers.length,
      },
      subscriptions: Object.fromEntries(subRows.map((r) => [r._id || 'unknown', r.count])),
      plans: planRows.map((r) => ({ plan: r._id || 'unknown', count: r.count })),
      salesByMonth: series,
      totalVolume: round(series.reduce((s, r) => s + r.volume, 0)),
      totalTransactions: series.reduce((s, r) => s + r.transactions, 0),
      monthOverMonthGrowth:
        lastMonth && lastMonth.volume ? round(((thisMonth.volume - lastMonth.volume) / lastMonth.volume) * 100) : null,
      topPharmacies: topRows.map((r) => ({
        pharmacyId: r._id,
        name: r.name,
        status: r.status,
        volume: round(r.volume),
        transactions: r.transactions,
      })),
    },
  });
};

// ----- Support mode ------------------------------------------------------------------

// @desc    Read-only overview of one pharmacy's key data for support staff.
//          Audited as support.view.
// @route   GET /api/admin/platform/pharmacies/:id/support
const getSupportOverview = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const pharmacy = await Pharmacy.findById(req.params.id).populate('owner', 'name email').lean();
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);
  const pharmacyId = new mongoose.Types.ObjectId(req.params.id);
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);

  const [staff, medicineCount, stockRows, sales30, recentSales, lowStock, movements, auditLogs, transfers] =
    await Promise.all([
      User.find({ 'memberships.pharmacyId': pharmacyId }).select('name email memberships createdAt').lean(),
      Medicine.countDocuments({ pharmacyId, isArchived: { $ne: true } }),
      StockBatch.aggregate([
        { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            batches: { $sum: 1 },
            units: { $sum: '$quantity' },
            value: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
            expired: { $sum: { $cond: [{ $lte: ['$expiryDate', now] }, 1, 0] } },
          },
        },
      ]),
      Sale.aggregate([
        { $match: { pharmacyId, createdAt: { $gte: since }, voided: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
      ]),
      Sale.find({ pharmacyId })
        .select('invoiceNumber grandTotal paymentMethod createdAt voided returnStatus')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Medicine.aggregate([
        { $match: { pharmacyId, isArchived: { $ne: true } } },
        { $project: { name: 1, minStockLevel: 1 } },
        {
          $lookup: {
            from: StockBatch.collection.name,
            localField: '_id',
            foreignField: 'medicineId',
            pipeline: [
              { $match: { status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
              { $group: { _id: null, qty: { $sum: '$quantity' } } },
            ],
            as: 'stock',
          },
        },
        {
          $project: {
            name: 1,
            minStockLevel: 1,
            qty: { $ifNull: [{ $first: '$stock.qty' }, 0] },
          },
        },
        { $match: { $expr: { $lte: ['$qty', { $ifNull: ['$minStockLevel', 10] }] } } },
        { $sort: { qty: 1 } },
        { $limit: 15 },
      ]),
      StockMovement.find({ pharmacyId })
        .select('type quantityChange balanceAfter reason createdAt medicineId')
        .populate('medicineId', 'name')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      AuditLog.find({ pharmacyId })
        .select('action entity userName userRole createdAt')
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      Transfer.find({ $or: [{ fromPharmacyId: pharmacyId }, { toPharmacyId: pharmacyId }] })
        .select('number status fromPharmacyId toPharmacyId createdAt')
        .populate('fromPharmacyId', 'name')
        .populate('toPharmacyId', 'name')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

  await audit(req, {
    action: 'support.view',
    entity: 'Pharmacy',
    entityId: pharmacyId,
    pharmacyId,
  });

  const stock = stockRows[0] || {};
  return res.status(200).json({
    success: true,
    readOnly: true,
    pharmacy,
    staff: staff.map((u) => {
      const m = (u.memberships || []).find((x) => String(x.pharmacyId) === String(pharmacyId)) || {};
      return { _id: u._id, name: u.name, email: u.email, role: m.role, active: m.active !== false };
    }),
    summary: {
      medicines: medicineCount,
      activeBatches: stock.batches || 0,
      stockUnits: stock.units || 0,
      stockValue: round(stock.value),
      expiredBatches: stock.expired || 0,
      sales30Days: round(sales30[0]?.total),
      salesCount30Days: sales30[0]?.count || 0,
    },
    recentSales,
    lowStock,
    movements,
    auditLogs,
    transfers,
  });
};

module.exports = {
  checkSubscriptions,
  listSubscriptions,
  updateSubscription,
  runSubscriptionCheck,
  getPlatformMetrics,
  getSupportOverview,
};
