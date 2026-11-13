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
  // Paid units received so far (never more than quantityOrdered).
  quantityReceived: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Free / bonus units received on top of the order (added to stock at zero cost).
  bonusQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const receiptLineSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    name: { type: String, default: '' },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockBatch' },
    batchNo: { type: String, required: true, trim: true },
    expiryDate: { type: Date, required: true },
    quantity: { type: Number, default: 0, min: 0 },
    bonusQuantity: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// One goods-received note (GRN) per delivery.
const receiptSchema = new mongoose.Schema({
  receiptNo: { type: String, required: true, trim: true },
  date: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supplierInvoiceNo: { type: String, default: '', trim: true },
  supplierInvoiceDate: { type: Date, default: null },
  notes: { type: String, default: '', trim: true },
  // Cost of the paid units in this receipt (bonus units are free).
  totalCost: { type: Number, default: 0, min: 0 },
  lines: [receiptLineSchema],
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
      // draft -> ordered -> partially_received -> received
      // closed = partially received and the rest will not come ("close short").
      enum: ['draft', 'ordered', 'partially_received', 'received', 'closed', 'cancelled'],
      default: 'ordered',
    },
    receipts: [receiptSchema],
    // Bumped on every receive; used as an optimistic-concurrency guard.
    receiveVersion: {
      type: Number,
      default: 0,
    },
    closedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closeReason: { type: String, default: '', trim: true },
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
purchaseOrderSchema.index({ pharmacyId: 1, status: 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
