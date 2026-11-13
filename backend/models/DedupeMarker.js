// Small "already done" markers used to make side effects idempotent across
// concurrent runs / several instances:
//   - notify.createNotification dedupe keys (lease until the dedupe window ends);
//   - daily summary emails/SMS (one per pharmacy per local day).
// _id is the marker key; a unique _id makes check-and-insert atomic.
// Expired markers are removed by the TTL index (MongoDB checks about once a minute).
const mongoose = require('mongoose');

const dedupeMarkerSchema = new mongoose.Schema(
  {
    _id: { type: String },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

dedupeMarkerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.DedupeMarker || mongoose.model('DedupeMarker', dedupeMarkerSchema);
