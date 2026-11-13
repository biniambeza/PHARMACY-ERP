const mongoose = require('mongoose');

const supplierInvoiceSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    invoiceNo: { type: String, required: [true, 'Invoice number is required'], trim: true },
    invoiceDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: [0.01, 'Invoice amount must be positive'] },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['open', 'partial', 'paid'], default: 'open' },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

supplierInvoiceSchema.virtual('balance').get(function balance() {
  return Math.max(0, Math.round(((this.amount || 0) - (this.amountPaid || 0)) * 100) / 100);
});
supplierInvoiceSchema.set('toJSON', { virtuals: true });
supplierInvoiceSchema.set('toObject', { virtuals: true });

// Invoice numbers are the supplier's own numbers: unique per supplier within a pharmacy
supplierInvoiceSchema.index({ pharmacyId: 1, supplierId: 1, invoiceNo: 1 }, { unique: true });
supplierInvoiceSchema.index({ pharmacyId: 1, status: 1, dueDate: 1 });
supplierInvoiceSchema.index({ pharmacyId: 1, purchaseOrderId: 1 });

module.exports = mongoose.model('SupplierInvoice', supplierInvoiceSchema);
