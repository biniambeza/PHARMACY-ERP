const mongoose = require('mongoose');

const MOVEMENT_TYPES = [
  'sale',
  'purchase_receive',
  'stock_in',
  'adjust_damaged',
  'adjust_expired',
  'correction',
  'delete',
  'return',
  'void',
  'transfer_out',
  'transfer_in',
  'stock_take',
  'expire',
  'unit_conversion',
];

const stockMovementSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockBatch',
      required: true,
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
    },
    type: {
      type: String,
      enum: MOVEMENT_TYPES,
      required: true,
    },
    // Signed change in units (negative for sales/adjustments/deletes)
    quantityChange: {
      type: Number,
      required: true,
    },
    // Batch quantity after this movement was applied
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Source document (e.g. Sale or PurchaseOrder)
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'refModel',
    },
    refModel: {
      type: String, // e.g. 'Sale', 'PurchaseOrder'
    },
    // Optional structured details, e.g. { costBefore, costAfter } when a stock-in into an
    // existing batch re-averages its unit cost.
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

stockMovementSchema.index({ pharmacyId: 1, createdAt: -1 });
stockMovementSchema.index({ batchId: 1, createdAt: -1 });
stockMovementSchema.index({ pharmacyId: 1, medicineId: 1, createdAt: -1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
StockMovement.MOVEMENT_TYPES = MOVEMENT_TYPES;

module.exports = StockMovement;
