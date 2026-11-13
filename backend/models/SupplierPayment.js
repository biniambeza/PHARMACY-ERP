const mongoose = require('mongoose');

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'mobile_money', 'card', 'other'];

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierInvoice', required: true },
    invoiceNo: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const supplierPaymentSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    paymentNo: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: [0.01, 'Payment amount must be positive'] },
    method: { type: String, enum: PAYMENT_METHODS, default: 'bank_transfer' },
    reference: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
    date: { type: Date, default: Date.now },
    allocations: { type: [allocationSchema], default: [] },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

supplierPaymentSchema.index({ pharmacyId: 1, paymentNo: 1 }, { unique: true });
supplierPaymentSchema.index({ pharmacyId: 1, supplierId: 1, date: -1 });

supplierPaymentSchema.statics.PAYMENT_METHODS = PAYMENT_METHODS;

module.exports = mongoose.model('SupplierPayment', supplierPaymentSchema);
