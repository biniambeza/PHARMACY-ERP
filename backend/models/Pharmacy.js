const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    tax: {
      enabled: { type: Boolean, default: false },
      name: { type: String, default: 'VAT', trim: true },
      rate: { type: Number, default: 15, min: 0, max: 100 },
      inclusive: { type: Boolean, default: false },
      registrationNo: { type: String, default: '', trim: true },
    },
    currency: { type: String, default: 'ETB', trim: true, uppercase: true },
    locale: { type: String, default: 'en', trim: true },
    receiptFooter: { type: String, default: '', trim: true },
    receiptWidth: { type: String, enum: ['58mm', '80mm', 'A4'], default: '80mm' },
    expiryAlertDays: { type: [Number], default: () => [30, 60, 90] },
    notify: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      dailySummary: { type: Boolean, default: false },
    },
    // 100 = no limit
    maxDiscountPercent: { type: Number, default: 100, min: 0, max: 100 },
    // POS (#7): require an open cash-drawer shift to sell. No default: pharmacies
    // without the setting (legacy) don't require one; the POS UI asks to open a shift anyway.
    requireShift: { type: Boolean },
  },
  { _id: false }
);

const pharmacySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide pharmacy name'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Please provide pharmacy address'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Please provide contact phone number'],
      trim: true,
    },
    licenseNo: {
      type: String,
      required: [true, 'Please provide pharmacy license number'],
      unique: true,
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Pharmacy must be assigned to a pharmacist user'],
      // Not unique: an owner can run several branches (see #23). Access is
      // governed by User.memberships; `owner` is kept for legacy data.
      index: true,
    },
    // Branch of an organization (null for legacy single pharmacies)
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'suspended', 'archived'],
        message: '{VALUE} is not a valid status. Allowed: active, suspended, archived',
      },
      default: 'active',
    },
    // Set when an admin archives (soft-deletes) the pharmacy. Its data is kept
    // for record retention, but its pharmacist can no longer sign in.
    archivedAt: {
      type: Date,
      default: null,
    },
    settings: {
      type: settingsSchema,
      default: () => ({}),
    },
    subscription: {
      plan: { type: String, default: 'standard', trim: true },
      status: {
        type: String,
        enum: ['trial', 'active', 'past_due', 'cancelled'],
        default: 'active',
      },
      currentPeriodEnd: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Pharmacy', pharmacySchema);
