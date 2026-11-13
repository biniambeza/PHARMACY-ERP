const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MEMBERSHIP_ROLES = ['owner', 'pharmacist', 'cashier', 'storekeeper'];

const membershipSchema = new mongoose.Schema(
  {
    pharmacyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: true,
    },
    role: {
      type: String,
      enum: {
        values: MEMBERSHIP_ROLES,
        message: '{VALUE} is not a valid staff role',
      },
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [8, 'Password must be at least 8 characters long'],
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'pharmacist'],
        message: '{VALUE} is not a valid role. Allowed roles: admin, pharmacist',
      },
      default: 'pharmacist',
    },
    // Included in every JWT (claim `tv`). Incrementing it revokes all tokens
    // issued before, e.g. after a password change.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Tenant access: one entry per pharmacy (branch) the user works in.
    // Users with role 'pharmacist' and no memberships who own a pharmacy
    // (Pharmacy.owner) are migrated lazily to an 'owner' membership
    // (see utils/membership.js).
    memberships: {
      type: [membershipSchema],
      default: [],
    },
    // Optional organization grouping several branches
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving to database
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Helper method to compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.index({ 'memberships.pharmacyId': 1 });

const User = mongoose.model('User', userSchema);
User.MEMBERSHIP_ROLES = MEMBERSHIP_ROLES;

module.exports = User;
