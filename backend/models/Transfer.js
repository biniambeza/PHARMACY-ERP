const mongoose = require('mongoose');

// Stock transfer between two branches (pharmacies) of the same organization (#23).
// Lifecycle: draft -> in_transit (stock deducted at the source) -> received
// (stock added at the destination) or cancelled (in_transit stock returned to
// the source).
const transferLineSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, trim: true, default: '' },
    // Source batch (set when the transfer is sent; optional on drafts)
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockBatch', default: null },
    batchNo: { type: String, trim: true, default: '' },
    expiryDate: { type: Date, default: null },
    quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    unitCost: { type: Number, default: 0, min: 0 },
    // Filled in when received
    destMedicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
    destBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockBatch', default: null },
  },
  { _id: true }
);

const transferSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    // TRF sequence of the source pharmacy
    number: { type: String, required: true, trim: true },
    fromPharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    toPharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    lines: {
      type: [transferLineSchema],
      validate: [(v) => Array.isArray(v) && v.length > 0, 'A transfer needs at least one line'],
    },
    status: {
      type: String,
      enum: ['draft', 'in_transit', 'received', 'cancelled'],
      default: 'draft',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date, default: null },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    receivedAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  { timestamps: true }
);

transferSchema.index({ fromPharmacyId: 1, number: 1 }, { unique: true });
transferSchema.index({ fromPharmacyId: 1, createdAt: -1 });
transferSchema.index({ toPharmacyId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Transfer', transferSchema);
