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
const { recordMovement } = require('../utils/stockMovement');
const { audit } = require('../utils/audit');
const notify = require('../services/notify');

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

const describeBatch = (b) => `${b.medicineId?.name || 'Medicine'} (batch ${b.batchNo}, qty ${b.quantity})`;

const listPreview = (items, max = 5) => {
  const shown = items.slice(0, max).join('; ');
  return items.length > max ? `${shown}; and ${items.length - max} more` : shown;
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
      title: `${expired.length} batch${expired.length === 1 ? '' : 'es'} expired`,
      message: `Removed from sale: ${listPreview(expired.map(describeBatch))}.`,
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
    const name = batch.medicineId?.name || 'Medicine';
    const n = await notify.createNotification({
      pharmacyId,
      type: 'expiring_soon',
      severity: threshold === thresholds[0] ? 'warning' : 'info',
      title: `${name} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      message: `Batch ${batch.batchNo} (qty ${batch.quantity}) expires on ${new Date(batch.expiryDate)
        .toISOString()
        .slice(0, 10)} (within ${threshold} days).`,
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
  const n = await notify.createNotification({
    pharmacyId,
    type: 'low_stock',
    severity: out ? 'critical' : 'warning',
    title: `${low.length} medicine${low.length === 1 ? ' is' : 's are'} low on stock`,
    message: `${out ? `${out} out of stock. ` : ''}${listPreview(low.map((m) => `${m.name} (${m.stock}/${m.minStockLevel})`))}.`,
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

  let created = 0;
  for (const po of pos) {
    const daysLate = Math.max(1, Math.floor((now.getTime() - new Date(po.expectedDelivery).getTime()) / DAY_MS));
    const n = await notify.createNotification({
      pharmacyId,
      type: 'po_overdue',
      severity: daysLate > 7 ? 'critical' : 'warning',
      title: `Purchase order ${po.poNumber} is overdue`,
      message: `${po.supplierId?.name || 'Supplier'} delivery was expected on ${new Date(po.expectedDelivery)
        .toISOString()
        .slice(0, 10)} (${daysLate} day${daysLate === 1 ? '' : 's'} late).`,
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

  const lines = [
    `Daily summary for ${pharmacy.name} (${now.toISOString().slice(0, 10)})`,
    '',
    `Sales in the last 24 hours: ${salesCount} (${currency} ${revenue.toFixed(2)})`,
    `Batches expired today: ${stats.expired || 0}`,
    `Batches expiring soon: ${stats.expiringSoon || 0}`,
    `Medicines low on stock: ${stats.lowStock || 0}`,
    `Overdue purchase orders: ${stats.overduePOs || 0}`,
  ];
  const text = lines.join('\n');

  // Email is the default channel for the summary; SMS only when enabled.
  let emailed = 0;
  if (n.email !== false) {
    const owners = await findOwners(pharmacy);
    for (const owner of owners) {
      if (!owner.email) continue;
      const res = await notify.sendEmail({
        to: owner.email,
        subject: `${pharmacy.name}: daily summary`,
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
      text: `${pharmacy.name}: ${salesCount} sales (${currency} ${revenue.toFixed(2)}), ${stats.expired || 0} expired, ${
        stats.lowStock || 0
      } low stock, ${stats.overduePOs || 0} overdue POs.`,
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
  runPharmacyChecks,
  runDailyChecks,
  findLowStock,
  normalizeThresholds,
  DAY_MS,
};
