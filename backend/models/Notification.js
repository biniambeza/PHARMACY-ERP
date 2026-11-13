const mongoose = require('mongoose');

// Known notification types. `type` is not an enum so other modules can add
// their own (e.g. 'shift_closed') without a schema change.
const NOTIFICATION_TYPES = [
  'low_stock',
  'expiring_soon',
  'expired',
  'po_overdue',
  'pharmacy_suspended',
  'daily_summary',
  'system',
];

const SEVERITIES = ['info', 'success', 'warning', 'critical'];

const notificationSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    // In-app path to open, e.g. '/pharmacy/expiry'
    link: {
      type: String,
      default: '',
      trim: true,
    },
    severity: {
      type: String,
      enum: SEVERITIES,
      default: 'info',
    },
    // Empty = visible to everyone in the pharmacy (subject to `perm`)
    userIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    // Optional permission required to see the notification (e.g. 'po:view')
    perm: {
      type: String,
      default: null,
    },
    readBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    // Same pharmacyId + type + dedupeKey within the dedupe window is not re-created
    dedupeKey: {
      type: String,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ pharmacyId: 1, createdAt: -1 });
notificationSchema.index({ pharmacyId: 1, type: 1, dedupeKey: 1, createdAt: -1 });
// Old notifications are purged automatically after 180 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);
Notification.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
Notification.SEVERITIES = SEVERITIES;

module.exports = Notification;
