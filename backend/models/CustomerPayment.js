const mongoose = require('mongoose');

const PAYMENT_METHODS = ['cash', 'card', 'mobile_money', 'bank_transfer', 'cheque', 'other'];

const allocationSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    invoiceNumber: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const customerPaymentSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    paymentNo: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: [0.01, 'Payment amount must be positive'] },
    method: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    reference: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
    allocations: { type: [allocationSchema], default: [] },
    // Part of the payment not matched to an open sale (e.g. older balances)
    unallocated: { type: Number, default: 0, min: 0 },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

customerPaymentSchema.index({ pharmacyId: 1, paymentNo: 1 }, { unique: true });
customerPaymentSchema.index({ pharmacyId: 1, customerId: 1, date: -1 });

customerPaymentSchema.statics.PAYMENT_METHODS = PAYMENT_METHODS;

module.exports = mongoose.model('CustomerPayment', customerPaymentSchema);
