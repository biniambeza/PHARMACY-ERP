const mongoose = require('mongoose');

const emptyToUndefined = (v) => {
  if (v === null || v === undefined) return undefined;
  const str = String(v).trim();
  return str === '' ? undefined : str;
};

const packUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. 'strip', 'box'
    factor: { type: Number, required: true, min: 1 }, // base units per pack
    price: { type: Number, min: 0, default: null }, // optional pack price
    barcode: { type: String, trim: true, set: emptyToUndefined },
  },
  { _id: true }
);

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
    // Soft-delete flag: medicines referenced by sales / purchase orders / stock
    // history are archived instead of deleted so that history stays intact.
    // ----- Catalog -----
    // Optional; unique per pharmacy when set (empty strings are stored as unset)
    barcode: {
      type: String,
      trim: true,
      set: emptyToUndefined,
    },
    sku: {
      type: String,
      trim: true,
      default: '',
    },
    // ----- Purchasing -----
    preferredSupplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },
    leadTimeDays: {
      type: Number,
      default: 7,
      min: 0,
    },
    reorderSafetyDays: {
      type: Number,
      default: 7,
      min: 0,
    },
    // ----- Pack units (stock is always kept in baseUnit) -----
    baseUnit: {
      type: String,
      trim: true,
      default: 'unit',
    },
    packUnits: {
      type: [packUnitSchema],
      default: [],
    },
    // ----- Flags -----
    taxExempt: {
      type: Boolean,
      default: false,
    },
    isControlled: {
      type: Boolean,
      default: false,
    },
    controlledSchedule: {
      type: String,
      trim: true,
      default: '',
    },
    minMarginPercent: {
      type: Number,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique medicine name per pharmacy
medicineSchema.index({ pharmacyId: 1, name: 1 }, { unique: true });
// Unique barcode per pharmacy, only for medicines that have one
medicineSchema.index(
  { pharmacyId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } }
);
medicineSchema.index({ pharmacyId: 1, 'packUnits.barcode': 1 });

module.exports = mongoose.model('Medicine', medicineSchema);
