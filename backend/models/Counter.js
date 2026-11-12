const mongoose = require('mongoose');

// Per-pharmacy sequence counters (e.g. invoice numbers, PO numbers).
const counterSchema = new mongoose.Schema({
  pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
  name: { type: String, required: true }, // e.g. 'invoice', 'po'
  seq: { type: Number, default: 0 },
});

counterSchema.index({ pharmacyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
