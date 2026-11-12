const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantityOrdered: {
    type: Number,
    required: true,
    min: 1,
  },
  unitCost: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
});

const purchaseOrderSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: true,
      index: true,
    },
    pharmacistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    // Unique per pharmacy (see compound index below); generated from an atomic
    // per-pharmacy counter, e.g. PO-2026-000001.
    poNumber: {
      type: String,
      required: true,
      trim: true,
    },
    items: [poItemSchema],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['ordered', 'received', 'cancelled'],
      default: 'ordered',
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    expectedDelivery: {
      type: Date,
    },
    receivedDate: {
      type: Date,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

purchaseOrderSchema.index({ pharmacyId: 1, createdAt: -1 });
purchaseOrderSchema.index({ pharmacyId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ pharmacyId: 1, 'items.medicineId': 1 });
purchaseOrderSchema.index({ pharmacyId: 1, supplierId: 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
