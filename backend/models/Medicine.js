const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: [true, 'Medicine must belong to a pharmacy'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide medicine brand name'],
      trim: true,
    },
    genericName: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      required: [true, 'Please provide medicine category'],
      trim: true,
    },
    dosageForm: {
      type: String,
      enum: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Inhaler', 'Other'],
      default: 'Tablet',
    },
    strength: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Please provide selling price per unit'],
      min: [0, 'Price cannot be negative'],
    },
    costPrice: {
      type: Number,
      default: 0,
      min: [0, 'Cost price cannot be negative'],
    },
    minStockLevel: {
      type: Number,
      default: 10,
      min: [0, 'Minimum stock level cannot be negative'],
    },
    requiresPrescription: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Unique medicine name per pharmacy
medicineSchema.index({ pharmacyId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Medicine', medicineSchema);
