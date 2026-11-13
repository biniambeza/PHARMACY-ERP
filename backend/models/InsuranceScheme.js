const mongoose = require('mongoose');

// Insurance / credit scheme (CBHI, employer scheme, private insurer). Owner: Insurance agent.
//
// Split rules (services/insurance.js computeInsuranceSplit):
//   eligible   = amount of the sale on medicines that are not excluded
//   covered    = eligible * coveragePercent / 100
//   copay      = 'percent' -> covered * copayValue / 100, 'fixed' -> copayValue per sale (capped at covered)
//   insurer    = covered - copay   (capped at maxPerSale when > 0)
//   patient    = grandTotal - insurer

const SCHEME_TYPES = ['cbhi', 'employer', 'private', 'other'];
const COPAY_TYPES = ['none', 'percent', 'fixed'];
const CLAIM_CYCLES = ['weekly', 'monthly', 'quarterly', 'on_demand'];

const insuranceSchemeSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    code: { type: String, default: '', trim: true, maxlength: 50 },
    type: { type: String, enum: SCHEME_TYPES, default: 'other' },
    payer: {
      name: { type: String, default: '', trim: true, maxlength: 200 },
      contactPerson: { type: String, default: '', trim: true, maxlength: 200 },
      phone: { type: String, default: '', trim: true, maxlength: 50 },
      email: { type: String, default: '', trim: true, maxlength: 200 },
      address: { type: String, default: '', trim: true, maxlength: 500 },
    },
    coveragePercent: { type: Number, default: 100, min: 0, max: 100 },
    copayType: { type: String, enum: COPAY_TYPES, default: 'none' },
    copayValue: { type: Number, default: 0, min: 0 },
    // 0 = no cap on the insurer share of one sale
    maxPerSale: { type: Number, default: 0, min: 0 },
    excludedMedicineIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Medicine' }],
    // Medicine categories (case-insensitive) that the scheme does not cover
    excludedCategories: [{ type: String, trim: true, maxlength: 100 }],
    claimCycle: { type: String, enum: CLAIM_CYCLES, default: 'monthly' },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

insuranceSchemeSchema.index({ pharmacyId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

const InsuranceScheme = mongoose.model('InsuranceScheme', insuranceSchemeSchema);
InsuranceScheme.SCHEME_TYPES = SCHEME_TYPES;
InsuranceScheme.COPAY_TYPES = COPAY_TYPES;
InsuranceScheme.CLAIM_CYCLES = CLAIM_CYCLES;

module.exports = InsuranceScheme;
