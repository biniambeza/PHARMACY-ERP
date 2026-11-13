// Stock movement ledger (#15). Owner: Catalog agent.
const mongoose = require('mongoose');
const StockMovement = require('../models/StockMovement');
const AppError = require('../utils/AppError');

const MAX_LIMIT = 500;

const parseDate = (v, label, endOfDay = false) => {
  if (v === undefined || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${label} date`, 400);
  // A plain YYYY-MM-DD "to" date includes the whole day
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setUTCHours(23, 59, 59, 999);
  return d;
};

const idFilter = (v, label) => {
  if (v === undefined || v === '') return null;
  if (!mongoose.isValidObjectId(v)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(String(v));
};

// @route GET /api/movements?medicineId=&batchId=&type=&userId=&from=&to=&page=&limit=
// @access stock:view
// `type` may be a comma-separated list. Results are newest first.
const getMovements = async (req, res) => {
  const q = req.query;
  const query = { pharmacyId: req.pharmacyId };

  const medicineId = idFilter(q.medicineId, 'medicine id');
  const batchId = idFilter(q.batchId, 'batch id');
  const userId = idFilter(q.userId, 'user id');
  if (medicineId) query.medicineId = medicineId;
  if (batchId) query.batchId = batchId;
  if (userId) query.userId = userId;

  if (typeof q.type === 'string' && q.type) {
    const types = q.type.split(',').map((t) => t.trim()).filter(Boolean);
    const bad = types.filter((t) => !StockMovement.MOVEMENT_TYPES.includes(t));
    if (bad.length) throw new AppError(`Unknown movement type: ${bad.join(', ')}`, 400);
    query.type = { $in: types };
  }

  const from = parseDate(q.from, 'from');
  const to = parseDate(q.to, 'to', true);
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = from;
    if (to) query.createdAt.$lte = to;
  }

  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(q.limit, 10) || 50));

  const [movements, total] = await Promise.all([
    StockMovement.find(query)
      .populate('medicineId', 'name strength baseUnit')
      .populate('batchId', 'batchNo expiryDate')
      .populate('userId', 'name')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    StockMovement.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    types: StockMovement.MOVEMENT_TYPES,
    movements,
  });
};

module.exports = { getMovements };
