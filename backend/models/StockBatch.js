const mongoose = require('mongoose');

const stockBatchSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: [true, 'Stock batch must belong to a pharmacy'],
      index: true,
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: [true, 'Stock batch must be linked to a medicine'],
      index: true,
    },
    batchNo: {
      type: String,
      required: [true, 'Please provide batch or lot number'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Please provide batch quantity'],
      min: [0, 'Quantity cannot be negative'],
    },
    initialQuantity: {
      type: Number,
      default: function () {
        return this.quantity;
      },
    },
    expiryDate: {
      type: Date,
      required: [true, 'Please provide expiry date'],
    },
    purchasePrice: {
      type: Number,
      default: 0,
      min: [0, 'Purchase price cannot be negative'],
    },
    status: {
      type: String,
      enum: ['active', 'depleted', 'expired', 'discarded'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-mark depleted if quantity hits 0
stockBatchSchema.pre('save', function () {
  if (this.quantity === 0 && this.status === 'active') {
    this.status = 'depleted';
  }
});

// Ensure unique batch per medicine within pharmacy
stockBatchSchema.index({ pharmacyId: 1, medicineId: 1, batchNo: 1 }, { unique: true });

module.exports = mongoose.model('StockBatch', stockBatchSchema);
