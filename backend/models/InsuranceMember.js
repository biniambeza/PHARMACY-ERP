const mongoose = require('mongoose');

// Member (beneficiary) of an insurance scheme. Owner: Insurance agent.
const insuranceMemberSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceScheme', required: true },
    memberNo: { type: String, required: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    phone: { type: String, default: '', trim: true, maxlength: 50 },
    // Employer / household / group the member belongs to (free text)
    group: { type: String, default: '', trim: true, maxlength: 200 },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    validFrom: { type: Date, default: null },
    // Inclusive: the member is valid until the end of this day
    validTo: { type: Date, default: null },
    active: { type: Boolean, default: true },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

insuranceMemberSchema.index({ pharmacyId: 1, schemeId: 1, memberNo: 1 }, { unique: true });
insuranceMemberSchema.index({ pharmacyId: 1, name: 1 });

module.exports = mongoose.model('InsuranceMember', insuranceMemberSchema);
