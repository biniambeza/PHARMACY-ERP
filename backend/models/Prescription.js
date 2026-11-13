const mongoose = require('mongoose');

// Prescription record (#16). `number` comes from the per-pharmacy 'prescription'
// sequence (RX-YYYY-000001).
const prescriptionItemSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
    name: { type: String, required: [true, 'Prescription item name is required'], trim: true },
    dose: { type: String, trim: true, default: '' },
    frequency: { type: String, trim: true, default: '' },
    durationDays: { type: Number, min: 0, default: 0 },
    // Quantity per fill, in base units
    quantityPrescribed: { type: Number, min: 0, default: 0 },
    quantityDispensed: { type: Number, min: 0, default: 0 },
    // Refills allowed after the first fill
    refillsAllowed: { type: Number, min: 0, default: 0 },
    refillsUsed: { type: Number, min: 0, default: 0 },
    lastDispensedAt: { type: Date, default: null },
  },
  { _id: true }
);

const prescriptionSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    number: { type: String, required: true, trim: true },
    // Number written on the paper prescription (optional)
    externalNumber: { type: String, trim: true, default: '' },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: [true, 'Patient is required'] },
    prescriberName: { type: String, required: [true, 'Prescriber name is required'], trim: true },
    prescriberLicense: { type: String, trim: true, default: '' },
    facility: { type: String, trim: true, default: '' },
    issueDate: { type: Date, required: [true, 'Issue date is required'] },
    expiryDate: { type: Date, default: null },
    // Scanned paper prescription as a data URL (image/* or application/pdf), max ~700KB.
    // Not selected by default (list queries stay small); use .select('+image').
    image: { type: String, default: '', select: false },
    imageType: { type: String, default: '' },
    imageName: { type: String, trim: true, default: '' },
    items: { type: [prescriptionItemSchema], default: [] },
    status: { type: String, enum: ['active', 'completed', 'expired', 'cancelled'], default: 'active' },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

prescriptionSchema.index({ pharmacyId: 1, number: 1 }, { unique: true });
prescriptionSchema.index({ pharmacyId: 1, patientId: 1, issueDate: -1 });
prescriptionSchema.index({ pharmacyId: 1, status: 1 });

module.exports = mongoose.model('Prescription', prescriptionSchema);
