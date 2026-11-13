const mongoose = require('mongoose');

const STOCK_TAKE_STATUSES = ['draft', 'counting', 'submitted', 'approved', 'cancelled'];

const lineSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    // Denormalised for display/reporting without populates
    medicineName: { type: String, default: '' },
    category: { type: String, default: '' },
    batchNo: { type: String, default: '' },
    expiryDate: { type: Date },
    unitCost: { type: Number, default: 0 },
    // Batch quantity when the count started
    systemQty: { type: Number, required: true, min: 0 },
    // null = not counted yet (skipped on approval)
    countedQty: { type: Number, default: null, min: 0 },
    variance: { type: Number, default: null },
    varianceValue: { type: Number, default: null },
    // Filled on approval: the delta actually applied to the batch
    appliedChange: { type: Number, default: null },
  },
  { _id: true }
);

const stockTakeSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    number: { type: String, required: true },
    scope: {
      category: { type: String, trim: true, default: '' },
    },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, enum: STOCK_TAKE_STATUSES, default: 'counting' },
    lines: { type: [lineSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

stockTakeSchema.index({ pharmacyId: 1, number: 1 }, { unique: true });
stockTakeSchema.index({ pharmacyId: 1, createdAt: -1 });

const StockTake = mongoose.model('StockTake', stockTakeSchema);
StockTake.STOCK_TAKE_STATUSES = STOCK_TAKE_STATUSES;

module.exports = StockTake;
