const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const Sale = require('../models/Sale');
const StockBatch = require('../models/StockBatch');
const AppError = require('../utils/AppError');

const OWNER_FIELDS = 'name email role';

// @desc    Create a new pharmacy and its pharmacist user account
// @route   POST /api/admin/pharmacies
// @access  Private (Admin only)
const createPharmacy = async (req, res) => {
  const {
    name,
    address,
    phone,
    licenseNo,
    pharmacistName,
    pharmacistEmail,
    pharmacistPassword,
  } = req.body || {};

  const fields = [name, address, phone, licenseNo, pharmacistName, pharmacistEmail, pharmacistPassword];
  if (fields.some((f) => typeof f !== 'string' || !f.trim())) {
    throw new AppError('Please provide all pharmacy and pharmacist fields', 400);
  }

  const email = pharmacistEmail.trim().toLowerCase();

  if (await User.exists({ email })) {
    throw new AppError('User with this email already exists', 409);
  }
  if (await Pharmacy.exists({ licenseNo: licenseNo.trim() })) {
    throw new AppError('Pharmacy with this license number already exists', 409);
  }

  // User + pharmacy are created atomically: if the pharmacy insert fails
  // (validation, duplicate license...), the user is rolled back too.
  const session = await mongoose.startSession();
  let pharmacyId;
  try {
    await session.withTransaction(async () => {
      const [pharmacist] = await User.create(
        [{ name: pharmacistName, email, password: pharmacistPassword, role: 'pharmacist' }],
        { session }
      );
      const [pharmacy] = await Pharmacy.create(
        [{ name, address, phone, licenseNo, owner: pharmacist._id }],
        { session }
      );
      pharmacyId = pharmacy._id;
    });
  } finally {
    await session.endSession();
  }

  const pharmacy = await Pharmacy.findById(pharmacyId).populate('owner', OWNER_FIELDS);

  return res.status(201).json({
    success: true,
    message: 'Pharmacy and pharmacist account created successfully',
    pharmacy,
  });
};

// @desc    Get all pharmacies with activity metrics
// @route   GET /api/admin/pharmacies?includeArchived=true&page=1&limit=50
// @access  Private (Admin only)
// Archived pharmacies are hidden unless includeArchived=true. Pagination is
// optional: without `page`/`limit` every pharmacy is returned.
const getPharmacies = async (req, res) => {
  const includeArchived = String(req.query.includeArchived).toLowerCase() === 'true';
  const filter = includeArchived ? {} : { status: { $ne: 'archived' } };

  const paginate = req.query.page !== undefined || req.query.limit !== undefined;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  let query = Pharmacy.find(filter).populate('owner', OWNER_FIELDS).sort({ createdAt: -1 }).lean();
  if (paginate) query = query.skip((page - 1) * limit).limit(limit);

  const [pharmacies, total] = await Promise.all([
    query,
    paginate ? Pharmacy.countDocuments(filter) : null,
  ]);

  const ids = pharmacies.map((p) => p._id);

  // One aggregation per collection instead of two queries per pharmacy
  const [batchCounts, saleCounts] = await Promise.all([
    StockBatch.aggregate([
      { $match: { pharmacyId: { $in: ids }, status: 'active', quantity: { $gt: 0 } } },
      { $group: { _id: '$pharmacyId', count: { $sum: 1 } } },
    ]),
    Sale.aggregate([
      { $match: { pharmacyId: { $in: ids } } },
      { $group: { _id: '$pharmacyId', count: { $sum: 1 } } },
    ]),
  ]);

  const toMap = (rows) => new Map(rows.map((r) => [String(r._id), r.count]));
  const batchMap = toMap(batchCounts);
  const saleMap = toMap(saleCounts);

  const pharmaciesWithMetrics = pharmacies.map((p) => ({
    ...p,
    activeBatches: batchMap.get(String(p._id)) || 0,
    totalSales: saleMap.get(String(p._id)) || 0,
  }));

  return res.status(200).json({
    success: true,
    count: pharmaciesWithMetrics.length,
    ...(paginate && { total, page, pages: Math.ceil(total / limit) || 1 }),
    pharmacies: pharmaciesWithMetrics,
  });
};

// @desc    Toggle pharmacy status (active / suspended). Archived pharmacies cannot be toggled.
// @route   PATCH /api/admin/pharmacies/:id/toggle-status
// @access  Private (Admin only)
const togglePharmacyStatus = async (req, res) => {
  const pharmacy = await Pharmacy.findById(req.params.id);

  if (!pharmacy) {
    throw new AppError('Pharmacy not found', 404);
  }
  if (pharmacy.status === 'archived') {
    throw new AppError('Archived pharmacies cannot be reactivated', 400);
  }

  pharmacy.status = pharmacy.status === 'active' ? 'suspended' : 'active';
  await pharmacy.save();
  await pharmacy.populate('owner', OWNER_FIELDS);

  return res.status(200).json({
    success: true,
    message: `Pharmacy status updated to ${pharmacy.status}`,
    pharmacy,
  });
};

// @desc    Archive (soft-delete) a pharmacy. Its data is retained; its pharmacist
//          can no longer sign in and existing sessions are revoked.
// @route   DELETE /api/admin/pharmacies/:id
// @access  Private (Admin only)
const deletePharmacy = async (req, res) => {
  const pharmacy = await Pharmacy.findById(req.params.id);

  if (!pharmacy) {
    throw new AppError('Pharmacy not found', 404);
  }

  if (pharmacy.status !== 'archived') {
    pharmacy.status = 'archived';
    pharmacy.archivedAt = new Date();
    await pharmacy.save();
    // Revoke the pharmacist's outstanding tokens
    await User.updateOne({ _id: pharmacy.owner }, { $inc: { tokenVersion: 1 } });
  }

  await pharmacy.populate('owner', OWNER_FIELDS);

  return res.status(200).json({
    success: true,
    message: 'Pharmacy archived. Its records are retained and its pharmacist can no longer sign in.',
    pharmacy,
  });
};

// @desc    Get system overview stats
// @route   GET /api/admin/stats
// @access  Private (Admin only)
const getSystemStats = async (req, res) => {
  const [statusCounts, totalPharmacists, salesAgg] = await Promise.all([
    Pharmacy.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments({ role: 'pharmacist' }),
    Sale.aggregate([
      { $group: { _id: null, totalGrossVolume: { $sum: '$grandTotal' }, totalTransactions: { $sum: 1 } } },
    ]),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const activePharmacies = byStatus.active || 0;
  const suspendedPharmacies = byStatus.suspended || 0;
  const archivedPharmacies = byStatus.archived || 0;

  return res.status(200).json({
    success: true,
    stats: {
      // Archived pharmacies are excluded from the total
      totalPharmacies: activePharmacies + suspendedPharmacies,
      activePharmacies,
      suspendedPharmacies,
      archivedPharmacies,
      totalPharmacists,
      totalGrossVolume: Number((salesAgg[0]?.totalGrossVolume || 0).toFixed(2)),
      totalTransactions: salesAgg[0]?.totalTransactions || 0,
    },
  });
};

module.exports = {
  createPharmacy,
  getPharmacies,
  togglePharmacyStatus,
  deletePharmacy,
  getSystemStats,
};
