const mongoose = require('mongoose');

const pharmacySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide pharmacy name'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Please provide pharmacy address'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Please provide contact phone number'],
      trim: true,
    },
    licenseNo: {
      type: String,
      required: [true, 'Please provide pharmacy license number'],
      unique: true,
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Pharmacy must be assigned to a pharmacist user'],
      unique: true,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'suspended', 'archived'],
        message: '{VALUE} is not a valid status. Allowed: active, suspended, archived',
      },
      default: 'active',
    },
    // Set when an admin archives (soft-deletes) the pharmacy. Its data is kept
    // for record retention, but its pharmacist can no longer sign in.
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Pharmacy', pharmacySchema);
