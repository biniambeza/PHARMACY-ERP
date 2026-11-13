const mongoose = require('mongoose');

// Platform-wide announcement written by a platform admin (#24) and shown to
// pharmacy users as a banner while active. `audience` is 'all' or 'pharmacies'
// (then only the listed pharmacyIds see it).
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Please provide a title'], trim: true, maxlength: 200 },
    message: { type: String, required: [true, 'Please provide a message'], trim: true, maxlength: 4000 },
    severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
    audience: { type: String, enum: ['all', 'pharmacies'], default: 'all' },
    pharmacyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy' }],
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

announcementSchema.index({ startsAt: 1, endsAt: 1 });
announcementSchema.index({ pharmacyIds: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
