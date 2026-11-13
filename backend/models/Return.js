const mongoose = require('mongoose');

// Sales return / credit note (#2). Owner: Returns agent.
// Quantities are in base units, like Sale.items[].quantity.

const DISPOSITIONS = ['restock', 'discard'];
const REFUND_METHODS = ['cash', 'card', 'mobile_money', 'credit', 'store_credit'];

const returnItemSchema = new mongoose.Schema(
  {
    saleItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    name: { type: String, required: true, trim: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    batchNo: { type: String, default: '', trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    // Patient refund for this line (grossAmount - insurerAmount)
    refundAmount: { type: Number, required: true, min: 0 },
    // Per-line amounts of what was actually paid for the returned quantity (set since the
    // per-line refund fix; older returns lack them and reports fall back to proportions):
    //   grossAmount    = line subtotal - its share of the sale discount + tax when prices exclude tax
    //   discountAmount = share of the sale-level discount
    //   taxAmount      = tax contained in grossAmount
    //   netAmount      = grossAmount - taxAmount (revenue net of tax)
    //   insurerAmount  = insurer share of grossAmount (insurance sales; comes off the claim)
    grossAmount: { type: Number, min: 0 },
    discountAmount: { type: Number, min: 0 },
    taxAmount: { type: Number, min: 0 },
    netAmount: { type: Number, min: 0 },
    insurerAmount: { type: Number, min: 0 },
    // What the user asked for
    disposition: { type: String, enum: DISPOSITIONS, default: 'restock' },
    // Whether stock was actually put back (false for discard, expired or missing batch)
    restocked: { type: Boolean, default: false },
    note: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const returnSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    invoiceNumber: { type: String, default: '', trim: true },
    returnNumber: { type: String, required: true, trim: true },
    customer: {
      name: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    items: {
      type: [returnItemSchema],
      validate: [(v) => Array.isArray(v) && v.length > 0, 'A return needs at least one item'],
    },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    refundMethod: { type: String, enum: REFUND_METHODS, default: 'cash' },
    refundTotal: { type: Number, required: true, min: 0 },
    // Part of refundTotal taken off the customer's credit balance (as reported by services/credit)
    creditReversed: { type: Number, default: 0, min: 0 },
    // Part of refundTotal paid back to the customer via refundMethod (refundTotal - creditReversed)
    refundDue: { type: Number, default: 0, min: 0 },
    // Sums of the per-item amounts (absent on older returns)
    grossTotal: { type: Number, min: 0 },
    taxTotal: { type: Number, min: 0 },
    netTotal: { type: Number, min: 0 },
    insurerTotal: { type: Number, min: 0 },
    // refundMethod 'store_credit': amount credited to the customer's account (services/credit)
    storeCredited: { type: Number, default: 0, min: 0 },
    // Insurer share taken off an already submitted/paid claim (services/insurance)
    claimAdjustment: {
      type: new mongoose.Schema(
        {
          claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceClaim', required: true },
          claimNumber: { type: String, default: '' },
          amount: { type: Number, required: true, min: 0 },
        },
        { _id: false }
      ),
      default: undefined,
    },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

returnSchema.index({ pharmacyId: 1, returnNumber: 1 }, { unique: true });
returnSchema.index({ pharmacyId: 1, createdAt: -1 });
returnSchema.index({ pharmacyId: 1, saleId: 1 });

const Return = mongoose.model('Return', returnSchema);
Return.DISPOSITIONS = DISPOSITIONS;
Return.REFUND_METHODS = REFUND_METHODS;

module.exports = Return;
