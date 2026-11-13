const mongoose = require('mongoose');
require('./User');
require('./Pharmacy');
require('./Medicine');
require('./StockBatch');

const saleItemSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockBatch',
    required: true,
  },
  batchNo: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  // Pack unit sold (quantity is always in base units; unitFactor = base units per unit sold)
  unitName: {
    type: String,
    default: 'unit',
    trim: true,
  },
  unitFactor: {
    type: Number,
    default: 1,
    min: 1,
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Batch purchase price per base unit at the time of sale (profit reports)
  costPrice: {
    type: Number,
    min: 0,
  },
  // Part of this line's total paid by the insurer (insurance sales only)
  insuranceAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const taxLineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, required: true, trim: true }, // cash, card, mobile_money, credit...
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, default: '', trim: true },
    provider: { type: String, default: '', trim: true }, // e.g. telebirr
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'completed',
    },
    // Mobile-money payment intent that confirmed this payment (provider flow)
    intentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentIntent', default: null },
    // Insurance lines (method 'insurance', status 'pending' until the insurer pays the claim)
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceScheme', default: undefined },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceMember', default: undefined },
    memberNo: { type: String, trim: true, default: undefined },
  },
  { _id: true }
);

const saleSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: true,
      index: true,
    },
    // Kept for compatibility; same user as staffId
    pharmacistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Staff member who made the sale
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
      default: null,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
    },
    prescriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      default: null,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    customer: {
      name: {
        type: String,
        default: 'Walk-in Customer',
        trim: true,
      },
      phone: {
        type: String,
        default: '',
        trim: true,
      },
    },
    items: [saleItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'mobile_money', 'credit', 'insurance'],
      default: 'cash',
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'partial', 'pending'],
      default: 'paid',
    },
    taxLines: {
      type: [taxLineSchema],
      default: [],
    },
    // Split payments; paymentMethod stays as the main method
    payments: {
      type: [paymentSchema],
      default: [],
    },
    amountPaid: {
      type: Number,
      min: 0,
    },
    balanceDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Cash handed over by the customer and change given back.
    // payments[].amount always holds the amount applied to the sale (sums to grandTotal).
    amountTendered: {
      type: Number,
      min: 0,
    },
    change: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Insurance sale: insurer share (receivable from the insurer, claimed via InsuranceClaim)
    insurance: {
      type: new mongoose.Schema(
        {
          schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceScheme', required: true },
          schemeName: { type: String, default: '', trim: true },
          memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceMember', required: true },
          memberNo: { type: String, default: '', trim: true },
          memberName: { type: String, default: '', trim: true },
          coveragePercent: { type: Number, default: 0 },
          copayType: { type: String, default: 'none' },
          copayValue: { type: Number, default: 0 },
          eligibleAmount: { type: Number, default: 0, min: 0 },
          copayAmount: { type: Number, default: 0, min: 0 },
          insurerAmount: { type: Number, default: 0, min: 0 },
          patientAmount: { type: Number, default: 0, min: 0 },
          claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsuranceClaim', default: null },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // Offline POS: when the sale was made on the client (bounded, see services/sales.js; createdAt is set to the same time)
    offlineCreatedAt: {
      type: Date,
      default: null,
    },
    // Offline sync review flags (services/sales.js): the client's prices differed from the
    // catalog at sync time, and/or the client clock was out of bounds ('future' | 'stale';
    // the raw client time is then kept in offlineClientCreatedAt and createdAt = sync time).
    offlinePriceAdjusted: { type: Boolean, default: undefined },
    offlineTimeFlag: { type: String, enum: ['future', 'stale'], default: undefined },
    offlineClientCreatedAt: { type: Date, default: undefined },
    // The pharmacist acknowledged severe allergy / interaction warnings for this sale
    clinicalAcknowledged: { type: Boolean, default: undefined },
    // Offline sale synced after its shift was closed (counted in Shift.lateSales, not in the Z-report totals)
    shiftLateSync: { type: Boolean, default: undefined },
    // Store credit (negative customer balance) that paid part of this sale's credit line
    // (services/credit.js), and how much of it returns / voids already gave back as store credit.
    // Undefined on older sales: derived from the customer ledger.
    storeCreditUsed: { type: Number, min: 0, default: undefined },
    storeCreditRestored: { type: Number, min: 0, default: undefined },
    // Returns and voids
    returnStatus: {
      type: String,
      enum: ['none', 'partial', 'full'],
      default: 'none',
    },
    voided: {
      type: Boolean,
      default: false,
    },
    voidReason: {
      type: String,
      default: '',
      trim: true,
    },
    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    // Client-generated id for offline sync de-duplication (unique per pharmacy when set)
    offlineId: {
      type: String,
      trim: true,
      set: (v) => (v === null || v === undefined || String(v).trim() === '' ? undefined : String(v).trim()),
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    // Required (number + prescriber) when any sold medicine requiresPrescription
    prescription: {
      number: { type: String, trim: true },
      prescriber: { type: String, trim: true },
      notes: { type: String, trim: true, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient tenant chronological queries
saleSchema.index({ pharmacyId: 1, createdAt: -1 });
saleSchema.index({ pharmacyId: 1, invoiceNumber: 1 }, { unique: true });
// Used to check whether a stock batch is referenced by any sale before deleting it
saleSchema.index({ 'items.batchId': 1 });
saleSchema.index(
  { pharmacyId: 1, offlineId: 1 },
  { unique: true, partialFilterExpression: { offlineId: { $type: 'string' } } }
);
saleSchema.index({ pharmacyId: 1, customerId: 1, createdAt: -1 });
saleSchema.index({ pharmacyId: 1, staffId: 1, createdAt: -1 });
saleSchema.index({ pharmacyId: 1, shiftId: 1 });
// Mobile money reference reuse check (services/sales.js findSaleUsingReference)
saleSchema.index(
  { pharmacyId: 1, 'payments.provider': 1, 'payments.reference': 1 },
  { name: 'mobile_money_reference', partialFilterExpression: { 'payments.method': 'mobile_money' } }
);
saleSchema.index(
  { pharmacyId: 1, 'insurance.schemeId': 1, 'insurance.claimId': 1, createdAt: 1 },
  { partialFilterExpression: { 'insurance.schemeId': { $exists: true } } }
);

module.exports = mongoose.model('Sale', saleSchema);
