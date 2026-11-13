const mongoose = require('mongoose');

// One row per change of a customer's balance (credit sale, payment, reversal).
// Used to build customer statements with a running balance.
const customerLedgerSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    type: { type: String, enum: ['sale', 'payment', 'reversal', 'adjustment'], required: true },
    // Signed: positive increases what the customer owes, negative decreases it
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    refModel: { type: String, default: '' },
    note: { type: String, default: '', trim: true },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

customerLedgerSchema.index({ pharmacyId: 1, customerId: 1, date: 1 });

module.exports = mongoose.model('CustomerLedger', customerLedgerSchema);
