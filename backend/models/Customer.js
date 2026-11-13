const mongoose = require('mongoose');

// Empty strings are stored as unset so the sparse unique phone index ignores them.
const optionalString = (v) =>
  v === null || v === undefined || String(v).trim() === '' ? undefined : String(v).trim();

const customerSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: 200,
    },
    // Unique per pharmacy when set
    phone: {
      type: String,
      trim: true,
      set: optionalString,
    },
    email: { type: String, default: '', trim: true, lowercase: true },
    address: { type: String, default: '', trim: true },
    // Maximum outstanding balance allowed. 0 = no credit allowed, null = unlimited.
    creditLimit: {
      type: Number,
      default: 0,
      min: [0, 'Credit limit cannot be negative'],
    },
    // Amount the customer currently owes the pharmacy. Only changed through
    // services/credit.js and the customer payment flow (atomic $inc).
    // Negative = store credit (e.g. a return refunded as 'store_credit'); the next
    // credit sales use it up first (services/credit.applyCreditSale).
    balance: {
      type: Number,
      default: 0,
    },
    // B2B fiscal invoices: buyer Taxpayer Identification Number and registered legal name
    tin: { type: String, default: '', trim: true, maxlength: 20 },
    legalName: { type: String, default: '', trim: true, maxlength: 200 },
    active: { type: Boolean, default: true, index: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

customerSchema.index(
  { pharmacyId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
);
customerSchema.index({ pharmacyId: 1, name: 1 });

module.exports = mongoose.model('Customer', customerSchema);
