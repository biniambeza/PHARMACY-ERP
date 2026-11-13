const mongoose = require('mongoose');

// One-time password reset token (#8). Only the SHA-256 hash of the token is
// stored; the raw token is sent to the user by email.
const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    // Set when a platform admin triggered the reset
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    requestedIp: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB removes expired tokens automatically
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
