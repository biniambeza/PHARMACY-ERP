const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const PasswordResetToken = require('../models/PasswordResetToken');
// Accessed as notify.sendEmail (not destructured) so tests can stub it.
const notify = require('../services/notify');
const { audit } = require('../utils/audit');
const AppError = require('../utils/AppError');
const generateToken = require('../utils/generateToken');
const { ensureMemberships, activeMemberships, describeMemberships } = require('../utils/membership');

const MIN_PASSWORD_LENGTH = 8;

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId || null,
});

// Verifies currentPassword, sets newPassword and bumps tokenVersion so every
// previously issued token stops working. Returns a fresh token for the caller.
// Shared with pharmacyController.updatePharmacistProfile.
const changeUserPassword = async (user, currentPassword, newPassword) => {
  if (!currentPassword) {
    throw new AppError('Please provide your current password to set a new password', 400);
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long`, 400);
  }
  const isMatch = await user.matchPassword(String(currentPassword));
  if (!isMatch) {
    throw new AppError('Current password does not match', 400);
  }

  user.password = newPassword; // hashed by the User pre-save hook
  user.tokenVersion = (user.tokenVersion || 0) + 1;
};

// @desc    Login user & get token
// @route   POST /api/auth/login
// @access  Public (rate limited)
const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Please provide both email and password',
    });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() });

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  // Tenant users: legacy owners are migrated to memberships here. Users whose
  // memberships are all deactivated, or whose pharmacies are all suspended /
  // archived, cannot sign in.
  let pharmacies;
  if (user.role === 'pharmacist') {
    const memberships = await ensureMemberships(user);
    const active = activeMemberships(memberships);
    if (memberships.length && !active.length) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your staff account has been deactivated. Please contact the pharmacy owner.',
      });
    }
    pharmacies = await Pharmacy.find({ _id: { $in: memberships.map((m) => m.pharmacyId) } })
      .select('name status organizationId address phone')
      .lean();
    const usable = pharmacies.filter((p) => active.some((m) => String(m.pharmacyId) === String(p._id)));
    if (usable.length && !usable.some((p) => p.status === 'active')) {
      const archived = usable.every((p) => p.status === 'archived');
      return res.status(403).json({
        success: false,
        code: archived ? 'PHARMACY_ARCHIVED' : 'PHARMACY_SUSPENDED',
        message: archived
          ? 'This pharmacy account has been closed. Please contact the administrator.'
          : 'This pharmacy account has been suspended. Please contact the administrator.',
      });
    }
  }

  return res.status(200).json({
    success: true,
    token: generateToken(user._id, user.role, user.tokenVersion || 0),
    user: publicUser(user),
    memberships: await describeMemberships(user, pharmacies),
  });
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
    memberships: await describeMemberships(req.user, req.userPharmacies),
  });
};

// @desc    Change own password (any role). Revokes all other sessions.
// @route   PUT /api/auth/password
// @access  Private
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError('User account not found', 404);
  }

  await changeUserPassword(user, currentPassword, newPassword);
  await user.save();

  return res.status(200).json({
    success: true,
    message: 'Password updated successfully',
    token: generateToken(user._id, user.role, user.tokenVersion),
    user: publicUser(user),
  });
};

// ------------------------------------------------------------------ password reset (#8)

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const FORGOT_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// First origin of CLIENT_URL (comma-separated), else the Vite dev server.
const clientBaseUrl = () => {
  const first = (process.env.CLIENT_URL || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .find(Boolean);
  return first || 'http://localhost:5173';
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Replaces any outstanding tokens of the user with a fresh one and emails the link.
const issueResetToken = async (user, { createdBy = null, ip = '' } = {}) => {
  const token = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    createdBy,
    requestedIp: ip || '',
  });

  const link = `${clientBaseUrl()}/reset-password?token=${token}`;
  const text = [
    `Hello ${user.name},`,
    '',
    'We received a request to reset the password of your pharmacy account.',
    `Open this link within 30 minutes to choose a new password:`,
    link,
    '',
    'If you did not request this, you can ignore this email; your password stays the same.',
  ].join('\n');
  const html = `<p>Hello ${escapeHtml(user.name)},</p>
<p>We received a request to reset the password of your pharmacy account.</p>
<p><a href="${escapeHtml(link)}">Reset your password</a> (valid for 30 minutes)</p>
<p>If you did not request this, you can ignore this email; your password stays the same.</p>`;

  return notify.sendEmail({ to: user.email, subject: 'Reset your password', text, html });
};

// @desc    Request a password reset email. Always answers 200 with the same message.
// @route   POST /api/auth/forgot-password
// @access  Public (rate limited)
const forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || email.length > 254) {
    throw new AppError('Please provide your email address', 400);
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (user) {
    // Not awaited: the response time must not reveal whether the account exists.
    issueResetToken(user, { ip: req.ip })
      .then(() =>
        audit(req, {
          action: 'auth.password_reset_requested',
          entity: 'User',
          entityId: user._id,
          userId: user._id,
          userName: user.name,
        })
      )
      .catch((err) => {
        if (process.env.NODE_ENV !== 'test') console.error('[auth] reset email failed:', err && err.message);
      });
  }

  return res.status(200).json({ success: true, message: FORGOT_MESSAGE });
};

// @desc    Set a new password with a reset token. Revokes all sessions.
// @route   POST /api/auth/reset-password
// @access  Public (rate limited)
const resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string' || token.length > 200) {
    throw new AppError('Invalid or expired reset link', 400);
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`, 400);
  }

  let user = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Claim the token atomically so it can be used only once
      const record = await PasswordResetToken.findOneAndUpdate(
        { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { returnDocument: 'after', session }
      );
      if (!record) throw new AppError('Invalid or expired reset link', 400);

      user = await User.findById(record.userId).session(session);
      if (!user) throw new AppError('Invalid or expired reset link', 400);

      user.password = password; // hashed by the pre-save hook
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save({ session });

      // Any other outstanding link for this user is now useless
      await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null }, { session });
    });
  } finally {
    await session.endSession();
  }

  await audit(req, {
    action: 'auth.password_reset',
    entity: 'User',
    entityId: user._id,
    userId: user._id,
    userName: user.name,
  });

  return res.status(200).json({
    success: true,
    message: 'Your password has been reset. Please sign in with your new password.',
  });
};

// Readable temporary password: no ambiguous characters, at least one digit.
const generateTempPassword = (length = 12) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return /\d/.test(out) ? out : `${out.slice(0, -1)}7`;
};

// @desc    Platform admin forces a password reset for a tenant user.
//          body { mode: 'temp' (default) | 'email' }
//          temp: sets a temporary password and returns it once.
//          email: sends a reset link to the user.
//          Both revoke the user's existing sessions.
// @route   POST /api/auth/admin-reset/:userId
// @access  Admin
const adminResetPassword = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) throw new AppError('Invalid user id', 400);
  const mode = (req.body && req.body.mode) === 'email' ? 'email' : 'temp';

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'admin') {
    throw new AppError('Admin passwords cannot be reset here; use the change password form', 400);
  }

  const auditEntry = {
    action: 'auth.admin_reset',
    entity: 'User',
    entityId: user._id,
    pharmacyId: (user.memberships || [])[0]?.pharmacyId || null,
    meta: { mode, targetEmail: user.email },
  };

  if (mode === 'email') {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    const result = await issueResetToken(user, { createdBy: req.user._id, ip: req.ip });
    await audit(req, auditEntry);
    return res.status(200).json({
      success: true,
      mode,
      emailSent: Boolean(result && result.sent),
      message: result && result.sent
        ? `A reset link was emailed to ${user.email}.`
        : `Reset link created, but email is not configured on the server. Use a temporary password instead.`,
    });
  }

  const tempPassword = generateTempPassword();
  user.password = tempPassword;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
  await audit(req, auditEntry);

  return res.status(200).json({
    success: true,
    mode,
    tempPassword,
    message: 'Temporary password set. Share it securely; the user should change it after signing in.',
  });
};

module.exports = {
  login,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  adminResetPassword,
  changeUserPassword,
  MIN_PASSWORD_LENGTH,
};
