// Cash drawer shift (#7). Owner: POS agent.
// One open shift per user per pharmacy (partial unique index below).
const mongoose = require('mongoose');

const moneyBlock = (fields) =>
  Object.fromEntries(fields.map((f) => [f, { type: Number, default: 0 }]));

const EXPECTED_FIELDS = ['cash', 'card', 'mobile_money', 'credit', 'cashSales', 'customerPaymentsCash', 'refundsCash'];
const COUNTED_FIELDS = ['cash', 'card', 'mobile_money'];

const shiftSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    shiftNumber: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    openedAt: { type: Date, default: Date.now },
    openingFloat: { type: Number, default: 0, min: 0 },
    openingNotes: { type: String, default: '', trim: true },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // expected.cash = openingFloat + cashSales + customerPaymentsCash - refundsCash
    expected: moneyBlock(EXPECTED_FIELDS),
    counted: moneyBlock(COUNTED_FIELDS),
    // counted - expected
    variance: moneyBlock(COUNTED_FIELDS),
    notes: { type: String, default: '', trim: true },
    // Z-report snapshot taken when the shift is closed
    zReport: { type: mongoose.Schema.Types.Mixed, default: null },
    // Sales attached while the shift was open. Every sale increments it with a write that is
    // conditional on status 'open' (services/sales.js), so a sale and the close (which sets
    // status 'closed' in a transaction, controllers/shiftController.js) always conflict: a
    // sale can never land in a shift whose Z-report was already frozen.
    salesCount: { type: Number, default: 0 },
    // Offline sales synced AFTER the shift was closed but made (client time) while it was
    // open. They are attached to the shift but are not in the frozen Z-report totals; the
    // Z-report shows them as a separate "late sync" line (count / total / last sync time).
    lateSales: {
      count: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      lastAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

shiftSchema.index({ pharmacyId: 1, shiftNumber: 1 }, { unique: true });
shiftSchema.index({ pharmacyId: 1, userId: 1, openedAt: -1 });
shiftSchema.index(
  { pharmacyId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' }, name: 'one_open_shift_per_user' }
);

const Shift = mongoose.model('Shift', shiftSchema);
Shift.EXPECTED_FIELDS = EXPECTED_FIELDS;
Shift.COUNTED_FIELDS = COUNTED_FIELDS;

module.exports = Shift;
