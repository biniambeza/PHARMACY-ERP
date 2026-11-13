const mongoose = require('mongoose');

// Fiscal e-invoice record (tax authority submission) for a sale or, as a credit
// note, for a sales return. Built and submitted by services/einvoice.
//
// One invoice per sale and one credit note per return (unique per pharmacy).
// `payload` is the immutable snapshot that was (or will be) sent to the provider.

const TYPES = ['invoice', 'credit_note'];
const STATUSES = ['pending', 'submitted', 'accepted', 'rejected', 'failed', 'not_required'];
const PROVIDERS = ['none', 'mock', 'mor'];

const fiscalInvoiceSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    type: { type: String, enum: TYPES, default: 'invoice' },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    // Credit notes: the return and the original fiscal invoice they correct
    returnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Return', default: null },
    originalInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalInvoice', default: null },
    invoiceNumber: { type: String, default: '', trim: true },
    invoiceDate: { type: Date, default: null },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    provider: { type: String, enum: PROVIDERS, default: 'none' },
    mode: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
    // Snapshot sent to the provider (seller/buyer TIN, invoice no, date, lines with tax, totals)
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    // Identifiers issued by the tax authority (or the test-only mock provider)
    fiscalNumber: { type: String, default: '', trim: true },
    irn: { type: String, default: '', trim: true },
    qrPayload: { type: String, default: '' },
    // Raw (trimmed) provider response, for troubleshooting
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    attempts: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    // Short-lived claim so two requests don't submit the same document at once
    lockedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

fiscalInvoiceSchema.index(
  { pharmacyId: 1, saleId: 1 },
  { unique: true, partialFilterExpression: { type: 'invoice' }, name: 'one_invoice_per_sale' }
);
fiscalInvoiceSchema.index(
  { pharmacyId: 1, returnId: 1 },
  { unique: true, partialFilterExpression: { type: 'credit_note' }, name: 'one_credit_note_per_return' }
);
fiscalInvoiceSchema.index({ pharmacyId: 1, status: 1, createdAt: -1 });

const FiscalInvoice = mongoose.model('FiscalInvoice', fiscalInvoiceSchema);
FiscalInvoice.TYPES = TYPES;
FiscalInvoice.STATUSES = STATUSES;
FiscalInvoice.PROVIDERS = PROVIDERS;

module.exports = FiscalInvoice;
