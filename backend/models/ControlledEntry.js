const mongoose = require('mongoose');

// Controlled substances register entry (#17). One entry per stock change of a
// controlled medicine. balanceAfter = sellable + expired stock of the medicine
// (quantity left in active/expired batches) right after the change.
const controlledEntrySchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockBatch', default: null },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
    prescriptionNumber: { type: String, trim: true, default: '' },
    prescriberName: { type: String, trim: true, default: '' },
    quantityOut: { type: Number, min: 0, default: 0 },
    quantityIn: { type: Number, min: 0, default: 0 },
    balanceAfter: { type: Number, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // transfer_out / transfer_in: stock sent to / received from another branch
    entryType: {
      type: String,
      enum: ['dispense', 'receive', 'return', 'adjust', 'transfer_out', 'transfer_in'],
      required: true,
    },
    // Source document (PO, return, stock adjustment...) when not a sale
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    notes: { type: String, trim: true, default: '' },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

controlledEntrySchema.index({ pharmacyId: 1, medicineId: 1, date: 1, _id: 1 });
controlledEntrySchema.index({ pharmacyId: 1, date: -1 });

module.exports = mongoose.model('ControlledEntry', controlledEntrySchema);
