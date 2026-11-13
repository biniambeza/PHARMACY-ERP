const mongoose = require('mongoose');

// Claim sent to an insurer for the insurer share of a set of sales. Owner: Insurance agent.
// Amounts are net of returns at the time the claim was built (refreshed again on submit).

const CLAIM_STATUSES = ['draft', 'submitted', 'partially_paid', 'paid', 'rejected'];

const claimSaleSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    invoiceNumber: { type: String, default: '', trim: true },
    saleDate: { type: Date, required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceMember', default: null },
    memberNo: { type: String, default: '', trim: true },
    memberName: { type: String, default: '', trim: true },
    saleTotal: { type: Number, default: 0, min: 0 },
    insurerAmount: { type: Number, default: 0, min: 0 },
    returnedAmount: { type: Number, default: 0, min: 0 },
    // Amount claimed for this sale = insurerAmount - returnedAmount
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const claimPaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true },
    reference: { type: String, default: '', trim: true, maxlength: 100 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const insuranceClaimSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceScheme', required: true },
    schemeName: { type: String, default: '', trim: true },
    claimNumber: { type: String, required: true, trim: true },
    periodFrom: { type: Date, required: true },
    periodTo: { type: Date, required: true },
    sales: { type: [claimSaleSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: CLAIM_STATUSES, default: 'draft' },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    payments: { type: [claimPaymentSchema], default: [] },
    rejectedAt: { type: Date, default: null },
    rejectionNotes: { type: String, default: '', trim: true, maxlength: 1000 },
    // Rejected claims: whether the sales were released back to the unclaimed pool
    salesReleased: { type: Boolean, default: false },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

insuranceClaimSchema.index({ pharmacyId: 1, claimNumber: 1 }, { unique: true });
insuranceClaimSchema.index({ pharmacyId: 1, schemeId: 1, createdAt: -1 });
insuranceClaimSchema.index({ pharmacyId: 1, status: 1 });

const InsuranceClaim = mongoose.model('InsuranceClaim', insuranceClaimSchema);
InsuranceClaim.CLAIM_STATUSES = CLAIM_STATUSES;

module.exports = InsuranceClaim;
