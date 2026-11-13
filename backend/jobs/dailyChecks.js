// Daily inventory checks (#4, #5). Owner: Notify agent.
//
// Each function takes a Pharmacy document (or lean object) and an optional
// `now` so tests can call them directly. Everything is idempotent:
// - expireBatches only touches batches that are still 'active';
// - notifications use dedupe keys so re-running does not duplicate them.
const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');
const PurchaseOrder = require('../models/PurchaseOrder');
const Sale = require('../models/Sale');
const User = require('../models/User');
const DedupeMarker = require('../models/DedupeMarker');
const { recordMovement } = require('../utils/stockMovement');
const { audit } = require('../utils/audit');
const notify = require('../services/notify');
const { t, pharmacyLocale, localDate } = require('../i18n/messages');
const { zonedDayKey, jobsTimeZone } = require('./lock');

const DAY_MS = 24 * 60 * 60 * 1000;
// Daily reminders use a window a bit shorter than a day so that a job running
// at the same time every day is not blocked by yesterday's notification.
const DAILY_REMINDER_WINDOW_MS = 20 * 60 * 60 * 1000;
const DEFAULT_THRESHOLDS = [30, 60, 90];

const isTest = () => process.env.NODE_ENV === 'test';
const logError = (...args) => {
  if (!isTest()) console.error('[jobs]', ...args);
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Positive integers, unique, ascending; falls back to [30, 60, 90].
const normalizeThresholds = (days) => {
  const list = (Array.isArray(days) ? days : [])
    .map((d) => Math.floor(Number(d)))
    .filter((d) => Number.isFinite(d) && d > 0 && d <= 3650);
  const unique = [...new Set(list)].sort((a, b) => a - b);
  return unique.length ? unique : [...DEFAULT_THRESHOLDS];
};

const daysUntil = (date, now) => Math.ceil((new Date(date).getTime() - now.getTime()) / DAY_MS);

const unitCost = (batch, medicine) =>
  Number(batch.purchasePrice) > 0 ? Number(batch.purchasePrice) : Number(medicine?.costPrice) || 0;

// Alert texts follow the pharmacy language (settings.locale), see backend/i18n/messages.js.
const describeBatch = (b, loc = 'en') =>
  t(loc, 'alert.batch', { name: b.medicineId?.name || t(loc, 'alert.medicine'), batch: b.batchNo, qty: b.quantity });

const listPreview = (items, max = 5, loc = 'en') => {
  const shown = items.slice(0, max).join('; ');
  return items.length > max ? t(loc, 'alert.andMore', { list: shown, count: String(items.length - max) }) : shown;
};

// ------------------------------------------------------------------ expire

/**
 * Marks active batches whose expiry date has passed as 'expired' and records
 * an 'expire' stock movement (quantityChange 0: the quantity is kept for
 * write-off reporting). Creates one 'expired' notification per run listing
 * the newly expired batches.
 */
const expireBatches = async (pharmacy, { now = new Date() } = {}) => {
  const pharmacyId = pharmacy._id;
  const loc = pharmacyLocale(pharmacy);
  const candidates = await StockBatch.find({
    pharmacyId,
    status: 'active',
    expiryDate: { $lte: now },
  })
    .populate('medicineId', 'name costPrice price')
    .lean();

  const expired = [];
  for (const batch of candidates) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const res = await StockBatch.updateOne(
          { _id: batch._id, pharmacyId, status: 'active' },
          { $set: { status: 'expired' } },
          { session }
        );
        if (!res.modifiedCount) return; // already handled by a concurrent run
        await recordMovement(
          {
            pharmacyId,
            batchId: batch._id,
            medicineId: batch.medicineId?._id || batch.medicineId,
            type: 'expire',
            quantityChange: 0,
            balanceAfter: Math.max(0, Number(batch.quantity) || 0),
            reason: 'auto-expired',
          },
          { session }
        );
        expired.push(batch);
      });
    } catch (err) {
      logError(`failed to expire batch ${batch._id}:`, err && err.message);
    } finally {
      await session.endSession();
    }
  }

  if (expired.length) {
    const costValue = round2(expired.reduce((s, b) => s + b.quantity * unitCost(b, b.medicineId), 0));
    await notify.createNotification({
      pharmacyId,
      type: 'expired',
      severity: 'critical',
      title: t(loc, 'alert.expiredTitle', { count: expired.length }),
      message: t(loc, 'alert.expiredMessage', { list: listPreview(expired.map((b) => describeBatch(b, loc)), 5, loc) }),
      link: '/pharmacy/expiry',
      perm: 'stock:view',
      meta: { batchIds: expired.map((b) => b._id), costValue },
    });
    await audit(null, {
      pharmacyId,
      action: 'stock.auto_expire',
      entity: 'StockBatch',
      userName: 'system',
      meta: { count: expired.length, batchIds: expired.map((b) => b._id), costValue },
    });
  }

  return { expired: expired.length, batchIds: expired.map((b) => b._id) };
};

// ------------------------------------------------------------------ expiring soon

/**
 * One notification per batch and threshold: a batch crossing into the
 * "expires within N days" bucket is announced once per bucket.
 */
const notifyExpiringSoon = async (pharmacy, { now = new Date() } = {}) => {
  const pharmacyId = pharmacy._id;
  const loc = pharmacyLocale(pharmacy);
  const thresholds = normalizeThresholds(pharmacy.settings?.expiryAlertDays);
  const maxDays = thresholds[thresholds.length - 1];

  const batches = await StockBatch.find({
    pharmacyId,
    status: 'active',
    quantity: { $gt: 0 },
    expiryDate: { $gt: now, $lte: new Date(now.getTime() + maxDays * DAY_MS) },
  })
    .populate('medicineId', 'name')
    .sort({ expiryDate: 1 })
    .lean();

  let created = 0;
  for (const batch of batches) {
    const daysLeft = daysUntil(batch.expiryDate, now);
    const threshold = thresholds.find((t) => daysLeft <= t);
    if (!threshold) continue;
    const name = batch.medicineId?.name || t(loc, 'alert.medicine');
    const n = await notify.createNotification({
      pharmacyId,
      type: 'expiring_soon',
      severity: threshold === thresholds[0] ? 'warning' : 'info',
      title: t(loc, 'alert.expiringTitle', { name, count: daysLeft }),
      message: t(loc, 'alert.expiringMessage', {
        batch: batch.batchNo,
        qty: batch.quantity,
        date: localDate(loc, batch.expiryDate),
        threshold,
      }),
      link: '/pharmacy/expiry',
      perm: 'stock:view',
      dedupeKey: `${batch._id}:${threshold}`,
      // The batch stays in this bucket for at most `threshold` days
      dedupeWindowMs: (threshold + 1) * DAY_MS,
      meta: { batchId: batch._id, medicineId: batch.medicineId?._id, threshold, daysLeft },
    });
    if (n && n.wasCreated) created += 1;
  }
  return { expiringSoon: batches.length, expiringNotified: created };
};

// ------------------------------------------------------------------ low stock

/** Sellable stock (active, unexpired) per medicine compared with minStockLevel. */
const findLowStock = async (pharmacyId, now = new Date()) => {
  const [medicines, stock] = await Promise.all([
    Medicine.find({ pharmacyId, isArchived: { $ne: true } })
      .select('name minStockLevel')
      .lean(),
    StockBatch.aggregate([
      { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
      { $group: { _id: '$medicineId', qty: { $sum: '$quantity' } } },
    ]),
  ]);
  const qtyById = new Map(stock.map((s) => [String(s._id), s.qty]));
  return medicines
    .map((m) => ({ _id: m._id, name: m.name, minStockLevel: m.minStockLevel || 0, stock: qtyById.get(String(m._id)) || 0 }))
    .filter((m) => m.minStockLevel > 0 && m.stock <= m.minStockLevel)
    .sort((a, b) => a.stock - b.stock);
};

/** One aggregated low-stock reminder per day. */
const notifyLowStock = async (pharmacy, { now = new Date() } = {}) => {
  const pharmacyId = pharmacy._id;
  const low = await findLowStock(pharmacyId, now);
  if (!low.length) return { lowStock: 0, lowStockNotified: false };

  const out = low.filter((m) => m.stock === 0).length;
  const loc = pharmacyLocale(pharmacy);
  const n = await notify.createNotification({
    pharmacyId,
    type: 'low_stock',
    severity: out ? 'critical' : 'warning',
    title: t(loc, 'alert.lowStockTitle', { count: low.length }),
    message: `${out ? t(loc, 'alert.outOfStock', { count: String(out) }) : ''}${listPreview(
      low.map((m) => `${m.name} (${m.stock}/${m.minStockLevel})`),
      5,
      loc
    )}${loc === 'am' ? '።' : '.'}`,
    link: '/pharmacy/stock',
    perm: 'stock:view',
    dedupeKey: 'daily',
    dedupeWindowMs: DAILY_REMINDER_WINDOW_MS,
    meta: { medicineIds: low.slice(0, 100).map((m) => m._id), count: low.length, outOfStock: out },
  });
  return { lowStock: low.length, lowStockNotified: Boolean(n && n.wasCreated) };
};

// ------------------------------------------------------------------ overdue POs

const OPEN_PO_STATUSES = ['ordered', 'partially_received'];

const notifyOverduePOs = async (pharmacy, { now = new Date() } = {}) => {
  const pharmacyId = pharmacy._id;
  const pos = await PurchaseOrder.find({
    pharmacyId,
    status: { $in: OPEN_PO_STATUSES },
    expectedDelivery: { $lt: now },
  })
    .populate('supplierId', 'name')
    .select('poNumber expectedDelivery supplierId status totalAmount')
    .lean();

  const loc = pharmacyLocale(pharmacy);
  let created = 0;
  for (const po of pos) {
    const daysLate = Math.max(1, Math.floor((now.getTime() - new Date(po.expectedDelivery).getTime()) / DAY_MS));
    const n = await notify.createNotification({
      pharmacyId,
      type: 'po_overdue',
      severity: daysLate > 7 ? 'critical' : 'warning',
      title: t(loc, 'alert.poOverdueTitle', { number: po.poNumber }),
      message: t(loc, 'alert.poOverdueMessage', {
        supplier: po.supplierId?.name || t(loc, 'alert.supplier'),
        date: localDate(loc, po.expectedDelivery),
        count: daysLate,
      }),
      link: '/pharmacy/procurement',
      perm: 'po:view',
      dedupeKey: String(po._id),
      dedupeWindowMs: DAILY_REMINDER_WINDOW_MS,
      meta: { poId: po._id, daysLate },
    });
    if (n && n.wasCreated) created += 1;
  }
  return { overduePOs: pos.length, overdueNotified: created };
};

// ------------------------------------------------------------------ daily summary

// Markers live a few days (TTL index), long enough to cover any re-run of the same day.
const SUMMARY_MARKER_TTL_MS = 3 * DAY_MS;

/**
 * Claims the right to send the summary of `pharmacyId` for the local day of `now`
 * (JOBS_TZ). Atomic: the marker _id is unique, so a second run / another instance
 * gets a duplicate-key error and must not send. Returns true when claimed.
 */
const claimDailySummary = async (pharmacyId, now) => {
  const _id = `daily-summary:${pharmacyId}:${zonedDayKey(now, jobsTimeZone())}`;
  try {
    await DedupeMarker.create({ _id, expiresAt: new Date(now.getTime() + SUMMARY_MARKER_TTL_MS) });
    return true;
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
};

const findOwners = async (pharmacy) => {
  const owners = await User.find({
    $or: [
      { memberships: { $elemMatch: { pharmacyId: pharmacy._id, role: 'owner', active: true } } },
      { _id: pharmacy.owner, memberships: { $size: 0 } },
    ],
  })
    .select('name email')
    .lean();
  return owners;
};

/**
 * Emails (and optionally texts) the owners a summary of yesterday's sales and
 * the current alerts when settings.notify.dailySummary is on.
 */
const sendDailySummary = async (pharmacy, stats = {}, { now = new Date() } = {}) => {
  const n = pharmacy.settings?.notify || {};
  if (!n.dailySummary) return { summarySent: false };

  const dayStart = new Date(now.getTime() - DAY_MS);
  const [salesAgg] = await Sale.aggregate([
    { $match: { pharmacyId: pharmacy._id, createdAt: { $gte: dayStart, $lt: now }, voided: { $ne: true } } },
    { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } },
  ]);
  const currency = pharmacy.settings?.currency || 'ETB';
  const salesCount = salesAgg?.count || 0;
  const revenue = round2(salesAgg?.revenue || 0);
  const loc = pharmacyLocale(pharmacy);
  const amount = `${currency} ${revenue.toFixed(2)}`;

  // String counts: these lines have no singular/plural variants.
  const lines = [
    t(loc, 'summary.heading', { pharmacy: pharmacy.name, date: localDate(loc, now) }),
    '',
    t(loc, 'summary.sales', { count: String(salesCount), amount }),
    t(loc, 'summary.expired', { count: String(stats.expired || 0) }),
    t(loc, 'summary.expiring', { count: String(stats.expiringSoon || 0) }),
    t(loc, 'summary.lowStock', { count: String(stats.lowStock || 0) }),
    t(loc, 'summary.overduePOs', { count: String(stats.overduePOs || 0) }),
  ];
  const text = lines.join('\n');

  // Recorded BEFORE sending: at most one summary per pharmacy per local day, even if the
  // job runs twice (catch-up + schedule, several instances, manual run-checks).
  if (!(await claimDailySummary(pharmacy._id, now))) return { summarySent: false, alreadySent: true };

  // Email is the default channel for the summary; SMS only when enabled.
  let emailed = 0;
  if (n.email !== false) {
    const owners = await findOwners(pharmacy);
    for (const owner of owners) {
      if (!owner.email) continue;
      const res = await notify.sendEmail({
        to: owner.email,
        subject: t(loc, 'summary.subject', { pharmacy: pharmacy.name }),
        text,
        html: `<pre style="font-family:system-ui,sans-serif">${text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre>`,
      });
      if (res && res.sent) emailed += 1;
    }
  }
  let texted = false;
  if (n.sms && pharmacy.phone) {
    const res = await notify.sendSms({
      to: pharmacy.phone,
      text: t(loc, 'summary.sms', {
        pharmacy: pharmacy.name,
        sales: salesCount,
        amount,
        expired: stats.expired || 0,
        lowStock: stats.lowStock || 0,
        overdue: stats.overduePOs || 0,
      }),
    });
    texted = Boolean(res && res.sent);
  }
  return { summarySent: true, emailed, texted, salesCount, revenue };
};

// ------------------------------------------------------------------ runners

/** Runs every check for one pharmacy. Each step is isolated. */
const runPharmacyChecks = async (pharmacy, { now = new Date(), summary = true } = {}) => {
  const stats = {};
  const steps = [
    ['expire', () => expireBatches(pharmacy, { now })],
    ['expiring', () => notifyExpiringSoon(pharmacy, { now })],
    ['lowStock', () => notifyLowStock(pharmacy, { now })],
    ['overdue', () => notifyOverduePOs(pharmacy, { now })],
  ];
  for (const [name, fn] of steps) {
    try {
      Object.assign(stats, await fn());
    } catch (err) {
      logError(`check "${name}" failed for pharmacy ${pharmacy._id}:`, err && err.message);
      stats.errors = [...(stats.errors || []), name];
    }
  }
  if (summary) {
    try {
      Object.assign(stats, await sendDailySummary(pharmacy, stats, { now }));
    } catch (err) {
      logError(`daily summary failed for pharmacy ${pharmacy._id}:`, err && err.message);
      stats.errors = [...(stats.errors || []), 'summary'];
    }
  }
  return stats;
};

/** Runs the checks for every active pharmacy. */
const runDailyChecks = async ({ now = new Date() } = {}) => {
  const pharmacies = await Pharmacy.find({ status: 'active' }).lean();
  const results = [];
  for (const pharmacy of pharmacies) {
    results.push({ pharmacyId: pharmacy._id, ...(await runPharmacyChecks(pharmacy, { now })) });
  }
  return results;
};

module.exports = {
  expireBatches,
  notifyExpiringSoon,
  notifyLowStock,
  notifyOverduePOs,
  sendDailySummary,
  claimDailySummary,
  runPharmacyChecks,
  runDailyChecks,
  findLowStock,
  normalizeThresholds,
  DAY_MS,
};
