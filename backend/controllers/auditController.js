// Audit log viewer (#19). Owner: Insights agent.
// Read-only: entries are written by utils/audit.js and never edited or deleted.
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');

const DAY_MS = 24 * 60 * 60 * 1000;

const requirePharmacy = (req) => {
  if (!req.pharmacyId) throw new AppError('Select a pharmacy (x-pharmacy-id) to view its audit log', 400);
  return new mongoose.Types.ObjectId(String(req.pharmacyId));
};

const castId = (value, field) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new AppError(`Invalid ${field}`, 400);
  }
  return new mongoose.Types.ObjectId(value);
};

const parseDate = (value, field, endOfDay = false) => {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(`Invalid ${field}`, 400);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${field}`, 400);
  // A bare YYYY-MM-DD "to" date includes the whole day
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return new Date(d.getTime() + DAY_MS);
  return d;
};

const buildFilter = (req) => {
  const q = req.query || {};
  const filter = { pharmacyId: requirePharmacy(req) };

  if (q.userId) filter.userId = castId(q.userId, 'userId');
  if (q.entityId) filter.entityId = castId(q.entityId, 'entityId');
  if (q.entity) {
    if (typeof q.entity !== 'string') throw new AppError('Invalid entity', 400);
    filter.entity = q.entity.trim();
  }
  if (q.action) {
    if (typeof q.action !== 'string') throw new AppError('Invalid action', 400);
    const action = q.action.trim();
    // "sale.*" or "sale." matches every action of a module
    if (action.endsWith('*') || action.endsWith('.')) {
      filter.action = { $regex: `^${escapeRegex(action.replace(/\*$/, ''))}` };
    } else {
      filter.action = action;
    }
  }
  if (q.search) {
    if (typeof q.search !== 'string') throw new AppError('Invalid search', 400);
    const rx = { $regex: escapeRegex(q.search.trim().slice(0, 100)), $options: 'i' };
    filter.$or = [{ userName: rx }, { action: rx }, { entity: rx }];
  }
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = parseDate(q.from, 'from');
    if (q.to) filter.createdAt.$lt = parseDate(q.to, 'to', true);
  }
  return filter;
};

// @desc    List audit entries (newest first), filterable and paginated
// @route   GET /api/audit?userId&action&entity&entityId&from&to&search&page&limit
// @access  Private (audit:view)
const listAuditLogs = async (req, res) => {
  const filter = buildFilter(req);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    logs,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
};

// @desc    Distinct actions, entities and users for the filter dropdowns
// @route   GET /api/audit/facets
// @access  Private (audit:view)
const getAuditFacets = async (req, res) => {
  const pharmacyId = requirePharmacy(req);
  const [actions, entities, users] = await Promise.all([
    AuditLog.distinct('action', { pharmacyId }),
    AuditLog.distinct('entity', { pharmacyId }),
    AuditLog.aggregate([
      { $match: { pharmacyId, userId: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$userId', name: { $first: '$userName' }, role: { $first: '$userRole' } } },
      { $sort: { name: 1 } },
    ]),
  ]);
  return res.status(200).json({
    success: true,
    actions: actions.filter(Boolean).sort(),
    entities: entities.filter(Boolean).sort(),
    users: users.map((u) => ({ _id: u._id, name: u.name || 'Unknown', role: u.role })),
  });
};

// @desc    One audit entry
// @route   GET /api/audit/:id
// @access  Private (audit:view)
const getAuditLog = async (req, res) => {
  const pharmacyId = requirePharmacy(req);
  const log = await AuditLog.findOne({ _id: castId(req.params.id, 'audit id'), pharmacyId }).lean();
  if (!log) throw new AppError('Audit entry not found', 404);
  return res.status(200).json({ success: true, log });
};

module.exports = { listAuditLogs, getAuditFacets, getAuditLog };
