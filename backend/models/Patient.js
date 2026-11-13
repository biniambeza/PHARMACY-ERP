const mongoose = require('mongoose');

// Patient record (#16). Tenant-scoped; never shared across pharmacies.
const allergySchema = new mongoose.Schema(
  {
    substance: { type: String, required: [true, 'Allergy substance is required'], trim: true, maxlength: 120 },
    reaction: { type: String, trim: true, default: '', maxlength: 300 },
    severity: { type: String, enum: ['mild', 'moderate', 'severe', 'unknown'], default: 'unknown' },
  },
  { _id: true }
);

const patientSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    name: { type: String, required: [true, 'Patient name is required'], trim: true, maxlength: 150 },
    dateOfBirth: { type: Date, default: null },
    // Used when the date of birth is unknown (age at registration)
    age: { type: Number, min: 0, max: 150, default: null },
    sex: { type: String, enum: ['male', 'female', 'other', 'unknown'], default: 'unknown' },
    phone: { type: String, trim: true, default: '', maxlength: 40 },
    allergies: { type: [allergySchema], default: [] },
    conditions: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

patientSchema.index({ pharmacyId: 1, name: 1 });
patientSchema.index({ pharmacyId: 1, phone: 1 });

module.exports = mongoose.model('Patient', patientSchema);
