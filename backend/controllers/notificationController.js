// In-app notifications (#5) and the expiry dashboard (#4). Owner: Notify agent.
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Pharmacy = require('../models/Pharmacy');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { ALL_PERMISSIONS, can } = require('../config/permissions');
const { runPharmacyChecks, DAY_MS } = require('../jobs/dailyChecks');

const requirePharmacy = (req) => {
  if (!req.pharmacyId) {
    throw new AppError('Select a pharmacy first (x-pharmacy-id header)', 400);
  }
  return req.pharmacyId;
};

// Notifications the current user may see: pharmacy-wide or addressed to them,
// and (when the notification carries a `perm`) allowed for their role.
const visibilityFilter = (req) => {
  const userId = req.user._id;
  const isAdmin = req.user.role === 'admin';
  const allowed = isAdmin ? ALL_PERMISSIONS : ALL_PERMISSIONS.filter((p) => can(req.membershipRole, p));
  return {
    pharmacyId: requirePharmacy(req),
    $and: [
      { $or: [{ 'userIds.0': { $exists: false } }, { userIds: userId }] },
      { $or: [{ perm: null }, { perm: { $in: allowed } }] },
    ],
  };
};

const toClient = (n, userId) => ({
  _id: n._id,
  type: n.type,
  title: n.title,
  message: n.message,
  link: n.link,
  severity: n.severity,
  meta: n.meta,
  createdAt: n.createdAt,
  read: (n.readBy || []).some((id) => String(id) === String(userId)),
});

// @desc    List my notifications (newest first) with the unread count
// @route   GET /api/notifications?page&limit&unread=true&type&severity
// @access  notifications:view
const getNotifications = async (req, res) => {
  const base = visibilityFilter(req);
  const userId = req.user._id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const filter = { ...base };
  if (req.query.unread === 'true') filter.readBy = { $ne: userId };
  if (typeof req.query.type === 'string' && req.query.type) filter.type = req.query.type;
  if (typeof req.query.severity === 'string' && Notification.SEVERITIES.includes(req.query.severity)) {
    filter.severity = req.query.severity;
  }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...base, readBy: { $ne: userId } }),
  ]);

  return res.status(200).json({
    success: true,
    notifications: items.map((n) => toClient(n, userId)),
    unreadCount,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
};

// @desc    Unread count only (cheap poll)
// @route   GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  const unreadCount = await Notification.countDocuments({ ...visibilityFilter(req), readBy: { $ne: req.user._id } });
  return res.status(200).json({ success: true, unreadCount });
};

// @desc    Mark one notification as read
// @route   PATCH /api/notifications/:id/read
const markRead = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError('Invalid notification id', 400);
  }
  const result = await Notification.updateOne(
    { _id: req.params.id, ...visibilityFilter(req) },
    { $addToSet: { readBy: req.user._id } }
  );
  if (!result.matchedCount) {
    throw new AppError('Notification not found', 404);
  }
  return res.status(200).json({ success: true });
};

// @desc    Mark all my notifications as read
// @route   POST /api/notifications/read-all
const markAllRead = async (req, res) => {
  const result = await Notification.updateMany(
    { ...visibilityFilter(req), readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  return res.status(200).json({ success: true, updated: result.modifiedCount || 0 });
};

// @desc    Run the daily checks for the current pharmacy now
// @route   POST /api/notifications/run-checks
// @access  settings:manage
const runChecks = async (req, res) => {
  const pharmacyId = requirePharmacy(req);
  const pharmacy = req.pharmacy || (await Pharmacy.findById(pharmacyId).lean());
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);

  const stats = await runPharmacyChecks(pharmacy, { summary: req.body?.summary === true });
  await audit(req, { action: 'notifications.run_checks', entity: 'Pharmacy', entityId: pharmacy._id, meta: stats });
  return res.status(200).json({ success: true, stats });
};

// ------------------------------------------------------------------ expiry overview

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const monthKey = (d) => new Date(d).toISOString().slice(0, 7);

// @desc    Expiry dashboard: buckets, write-off per month, return-to-supplier list
// @route   GET /api/notifications/expiry-overview
// @access  stock:view
const getExpiryOverview = async (req, res) => {
  const pharmacyId = requirePharmacy(req);
  const now = new Date();
  const horizon = new Date(now.getTime() + 90 * DAY_MS);

  const pharmacy = req.pharmacy || (await Pharmacy.findById(pharmacyId).select('settings').lean());
  const currency = pharmacy?.settings?.currency || 'ETB';

  // Batches still holding stock that are expired or expire within 90 days
  const batches = await StockBatch.find({
    pharmacyId,
    quantity: { $gt: 0 },
    $or: [
      { status: 'expired' },
      { status: 'active', expiryDate: { $lte: horizon } },
    ],
  })
    .populate('medicineId', 'name genericName strength price costPrice preferredSupplierId')
    .sort({ expiryDate: 1 })
    .limit(5000)
    .lean();

  // Supplier tracing: the PO that received the batch, else the medicine's preferred supplier
  const batchIds = batches.map((b) => b._id);
  const receipts = batchIds.length
    ? await StockMovement.find({
        pharmacyId,
        batchId: { $in: batchIds },
        type: 'purchase_receive',
        refModel: 'PurchaseOrder',
      })
        .select('batchId refId')
        .lean()
    : [];
  const poIdByBatch = new Map(receipts.filter((r) => r.refId).map((r) => [String(r.batchId), String(r.refId)]));
  const pos = poIdByBatch.size
    ? await PurchaseOrder.find({ pharmacyId, _id: { $in: [...new Set(poIdByBatch.values())] } })
        .select('poNumber supplierId')
        .lean()
    : [];
  const poById = new Map(pos.map((p) => [String(p._id), p]));

  const supplierIds = new Set();
  for (const p of pos) if (p.supplierId) supplierIds.add(String(p.supplierId));
  for (const b of batches) if (b.medicineId?.preferredSupplierId) supplierIds.add(String(b.medicineId.preferredSupplierId));
  const suppliers = supplierIds.size
    ? await Supplier.find({ pharmacyId, _id: { $in: [...supplierIds] } }).select('name phone email contactPerson').lean()
    : [];
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));

  const buckets = {
    expired: { key: 'expired', label: 'Expired', count: 0, quantity: 0, costValue: 0, retailValue: 0, items: [] },
    d30: { key: 'd30', label: 'Within 30 days', count: 0, quantity: 0, costValue: 0, retailValue: 0, items: [] },
    d60: { key: 'd60', label: '31 to 60 days', count: 0, quantity: 0, costValue: 0, retailValue: 0, items: [] },
    d90: { key: 'd90', label: '61 to 90 days', count: 0, quantity: 0, costValue: 0, retailValue: 0, items: [] },
  };
  const returnGroups = new Map();

  for (const b of batches) {
    const med = b.medicineId || {};
    const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / DAY_MS);
    const unitCost = Number(b.purchasePrice) > 0 ? Number(b.purchasePrice) : Number(med.costPrice) || 0;
    const costValue = round2(b.quantity * unitCost);
    const retailValue = round2(b.quantity * (Number(med.price) || 0));

    const poId = poIdByBatch.get(String(b._id));
    const po = poId ? poById.get(poId) : null;
    let supplierId = null;
    let supplierSource = 'unknown';
    if (po && po.supplierId) {
      supplierId = String(po.supplierId);
      supplierSource = 'purchase_order';
    } else if (med.preferredSupplierId) {
      supplierId = String(med.preferredSupplierId);
      supplierSource = 'preferred_supplier';
    }

    const item = {
      batchId: b._id,
      batchNo: b.batchNo,
      medicineId: med._id,
      medicineName: med.name || 'Unknown medicine',
      strength: med.strength || '',
      quantity: b.quantity,
      expiryDate: b.expiryDate,
      daysLeft,
      status: b.status,
      unitCost,
      costValue,
      retailValue,
      poNumber: po ? po.poNumber : null,
      supplierId,
      supplierSource,
    };

    const bucket =
      b.status === 'expired' || daysLeft <= 0
        ? buckets.expired
        : daysLeft <= 30
          ? buckets.d30
          : daysLeft <= 60
            ? buckets.d60
            : buckets.d90;
    bucket.count += 1;
    bucket.quantity += b.quantity;
    bucket.costValue += costValue;
    bucket.retailValue += retailValue;
    bucket.items.push(item);

    const groupKey = supplierId || 'unknown';
    if (!returnGroups.has(groupKey)) {
      const s = supplierId ? supplierById.get(supplierId) : null;
      returnGroups.set(groupKey, {
        supplierId,
        name: s ? s.name : 'Unknown supplier',
        phone: s?.phone || '',
        email: s?.email || '',
        contactPerson: s?.contactPerson || '',
        count: 0,
        quantity: 0,
        costValue: 0,
        items: [],
      });
    }
    const g = returnGroups.get(groupKey);
    g.count += 1;
    g.quantity += b.quantity;
    g.costValue += costValue;
    g.items.push(item);
  }

  for (const bucket of Object.values(buckets)) {
    bucket.costValue = round2(bucket.costValue);
    bucket.retailValue = round2(bucket.retailValue);
  }
  const returnToSupplier = [...returnGroups.values()]
    .map((g) => ({ ...g, costValue: round2(g.costValue) }))
    .sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || b.costValue - a.costValue);

  // Write-off value per month (last 12 months): auto-expired batches (quantity
  // at expiry) plus manual "expired" adjustments of batches that were not auto-expired.
  const since = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const movements = await StockMovement.find({
    pharmacyId,
    type: { $in: ['expire', 'adjust_expired'] },
    createdAt: { $gte: since },
  })
    .select('batchId type quantityChange balanceAfter createdAt')
    .lean();
  const autoExpired = new Set(movements.filter((m) => m.type === 'expire').map((m) => String(m.batchId)));
  const mvBatchIds = [...new Set(movements.map((m) => String(m.batchId)))];
  const mvBatches = mvBatchIds.length
    ? await StockBatch.find({ pharmacyId, _id: { $in: mvBatchIds } })
        .select('purchasePrice medicineId')
        .populate('medicineId', 'price costPrice')
        .lean()
    : [];
  const mvBatchById = new Map(mvBatches.map((b) => [String(b._id), b]));

  const months = new Map();
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 15);
    months.set(monthKey(d), { month: monthKey(d), quantity: 0, costValue: 0, retailValue: 0, batches: 0 });
  }
  for (const m of movements) {
    let qty;
    if (m.type === 'expire') qty = Number(m.balanceAfter) || 0;
    else if (!autoExpired.has(String(m.batchId))) qty = Math.abs(Number(m.quantityChange) || 0);
    else continue;
    if (!qty) continue;
    const b = mvBatchById.get(String(m.batchId));
    const unitCost = b && Number(b.purchasePrice) > 0 ? Number(b.purchasePrice) : Number(b?.medicineId?.costPrice) || 0;
    const key = monthKey(m.createdAt);
    if (!months.has(key)) continue;
    const row = months.get(key);
    row.quantity += qty;
    row.costValue += qty * unitCost;
    row.retailValue += qty * (Number(b?.medicineId?.price) || 0);
    row.batches += 1;
  }
  const writeOffs = [...months.values()].map((r) => ({
    ...r,
    costValue: round2(r.costValue),
    retailValue: round2(r.retailValue),
  }));

  return res.status(200).json({
    success: true,
    currency,
    generatedAt: now,
    buckets,
    writeOffs,
    returnToSupplier,
  });
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  runChecks,
  getExpiryOverview,
  visibilityFilter,
};
