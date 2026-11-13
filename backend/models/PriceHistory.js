const mongoose = require('mongoose');

// One row per price change on a medicine (#14).
//   field 'price'     -> selling price per base unit
//   field 'costPrice' -> cost per base unit
//   field 'packPrice' -> selling price of a pack unit (unitName says which)
const priceHistorySchema = new mongoose.Schema(
  {
    pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', required: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    field: { type: String, enum: ['price', 'costPrice', 'packPrice'], required: true },
    unitName: { type: String, trim: true, default: '' },
    old: { type: Number, default: null },
    new: { type: Number, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, default: '' },
    source: { type: String, enum: ['edit', 'bulk', 'import'], default: 'edit' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

priceHistorySchema.index({ pharmacyId: 1, medicineId: 1, createdAt: -1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
