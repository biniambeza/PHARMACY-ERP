const mongoose = require('mongoose');

// Drug interaction rule (#18). pharmacyId null = global rule. The built-in
// global starter list lives in data/interactionRules.json and is loaded in
// memory by services/clinical.js (global rows stored here are also honoured);
// pharmacies add their own rules here. substanceA/substanceB are normalized
// lowercase generic names, stored sorted (A <= B).
const interactionRuleSchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', default: null, index: true },
    substanceA: { type: String, required: [true, 'Substance A is required'], trim: true, lowercase: true, maxlength: 120 },
    substanceB: { type: String, required: [true, 'Substance B is required'], trim: true, lowercase: true, maxlength: 120 },
    severity: {
      type: String,
      enum: ['minor', 'moderate', 'major', 'contraindicated'],
      default: 'moderate',
    },
    description: { type: String, trim: true, default: '', maxlength: 1000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

interactionRuleSchema.index({ pharmacyId: 1, substanceA: 1, substanceB: 1 }, { unique: true });

module.exports = mongoose.model('InteractionRule', interactionRuleSchema);
