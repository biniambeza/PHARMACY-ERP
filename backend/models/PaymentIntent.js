// Mobile money payment intent (#26). Owner: POS agent.
// Created by the POS before checkout. The 'manual' provider confirms immediately
// (the cashier typed the transaction reference); real providers start 'pending'
// and are confirmed by the provider webhook. A confirmed intent is consumed by
// exactly one sale (saleId).
const mongoose = require('mongoose');

const STATUSES = ['pending', 'confirmed', 'failed', 'cancelled'];

const paymentIntentSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    provider: { type: String, required: true, trim: true, lowercase: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'ETB', trim: true, uppercase: true },
    phone: { type: String, default: '', trim: true },
    // Transaction reference shown to the cashier / printed on the receipt
    reference: { type: String, default: '', trim: true },
    // Provider-side id used to match webhooks
    providerRef: { type: String, trim: true },
    status: { type: String, enum: STATUSES, default: 'pending' },
    failureReason: { type: String, default: '', trim: true },
    confirmedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
  },
  { timestamps: true }
);

paymentIntentSchema.index(
  { provider: 1, providerRef: 1 },
  { unique: true, partialFilterExpression: { providerRef: { $type: 'string' } } }
);

const PaymentIntent = mongoose.model('PaymentIntent', paymentIntentSchema);
PaymentIntent.STATUSES = STATUSES;

module.exports = PaymentIntent;
