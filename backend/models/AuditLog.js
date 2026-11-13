const mongoose = require('mongoose');

// Append-only record of sensitive actions. Written through utils/audit.js.
const auditLogSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' }, // membership role (or 'admin')
    action: { type: String, required: true, trim: true }, // e.g. 'staff.create'
    entity: { type: String, default: '', trim: true }, // e.g. 'User', 'Sale'
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ pharmacyId: 1, createdAt: -1 });
auditLogSchema.index({ pharmacyId: 1, entity: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ pharmacyId: 1, userId: 1, createdAt: -1 });
auditLogSchema.index({ pharmacyId: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
