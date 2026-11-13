const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

const toObjectIdOrNull = (v) => {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  if (v._id instanceof mongoose.Types.ObjectId) return v._id;
  return mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null;
};

// Converts mongoose documents to plain objects and strips secrets.
const sanitize = (value) => {
  if (value === undefined || value === null) return null;
  let plain = value;
  if (typeof value.toObject === 'function') plain = value.toObject({ depopulate: true });
  if (plain && typeof plain === 'object' && !Array.isArray(plain)) {
    // eslint-disable-next-line no-unused-vars
    const { password, tokenVersion, __v, ...rest } = plain;
    return rest;
  }
  return plain;
};

// Records an audit entry. Never throws (failures are logged and swallowed).
//   audit(req, { action, entity, entityId, before, after, meta, pharmacyId? }, { session }?)
// `req` may be null for system jobs; then pass pharmacyId/userId in the entry.
const audit = async (req, entry = {}, { session } = {}) => {
  try {
    const user = req && req.user;
    const doc = {
      pharmacyId: toObjectIdOrNull(entry.pharmacyId || (req && req.pharmacyId)),
      userId: toObjectIdOrNull(entry.userId || (user && user._id)),
      userName: (user && user.name) || entry.userName || '',
      userRole: (req && req.membershipRole) || (user && user.role) || '',
      action: String(entry.action || 'unknown'),
      entity: entry.entity ? String(entry.entity) : '',
      entityId: toObjectIdOrNull(entry.entityId),
      before: sanitize(entry.before),
      after: sanitize(entry.after),
      meta: entry.meta === undefined ? null : entry.meta,
      ip: (req && (req.ip || (req.socket && req.socket.remoteAddress))) || '',
      userAgent: (req && req.headers && String(req.headers['user-agent'] || '').slice(0, 500)) || '',
    };
    const [created] = await AuditLog.create([doc], session ? { session } : {});
    return created;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[audit] failed to write audit log:', err && err.message);
    }
    return null;
  }
};

module.exports = { audit };
