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
const twoFactor = require('../utils/twoFactor');
const QRCode = require('qrcode');
const { ensureMemberships, activeMemberships, describeMemberships } = require('../utils/membership');

const MIN_PASSWORD_LENGTH = 8;

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId || null,
  twoFactorEnabled: Boolean(user.twoFactor && user.twoFactor.enabled),
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

  const access = await checkTenantAccess(user);
  if (access.blocked) return res.status(403).json(access.blocked);

  // Two-factor login: the password was right, but no session token is issued
  // until the second step (POST /auth/login/2fa) succeeds.
  if (user.twoFactor && user.twoFactor.enabled) {
    return res.status(200).json({
      success: true,
      twoFactorRequired: true,
      challengeToken: twoFactor.signChallenge(user),
      message: 'Enter the code from your authenticator app',
    });
  }

  return res.status(200).json(await loginResponse(user, access.pharmacies));
};

// Tenant users: legacy owners are migrated to memberships here. Users whose
// memberships are all deactivated, or whose pharmacies are all suspended /
// archived, cannot sign in. Returns { blocked: <403 body> } or { pharmacies }.
const checkTenantAccess = async (user) => {
  if (user.role !== 'pharmacist') return { pharmacies: undefined };
  const memberships = await ensureMemberships(user);
  const active = activeMemberships(memberships);
  if (memberships.length && !active.length) {
    return {
      blocked: {
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your staff account has been deactivated. Please contact the pharmacy owner.',
      },
    };
  }
  const pharmacies = await Pharmacy.find({ _id: { $in: memberships.map((m) => m.pharmacyId) } })
    .select('name status organizationId address phone')
    .lean();
  const usable = pharmacies.filter((p) => active.some((m) => String(m.pharmacyId) === String(p._id)));
  if (usable.length && !usable.some((p) => p.status === 'active')) {
    const archived = usable.every((p) => p.status === 'archived');
    return {
      blocked: {
        success: false,
        code: archived ? 'PHARMACY_ARCHIVED' : 'PHARMACY_SUSPENDED',
        message: archived
          ? 'This pharmacy account has been closed. Please contact the administrator.'
          : 'This pharmacy account has been suspended. Please contact the administrator.',
      },
    };
  }
  return { pharmacies };
};

const loginResponse = async (user, pharmacies) => ({
  success: true,
  token: generateToken(user._id, user.role, user.tokenVersion || 0),
  user: publicUser(user),
  memberships: await describeMemberships(user, pharmacies),
});

// ------------------------------------------------------------ two-factor login

const TWO_FACTOR_FIELDS =
  '+twoFactor.secret +twoFactor.pendingSecret +twoFactor.pendingCreatedAt +twoFactor.lastUsedStep +twoFactor.recoveryCodes';

const loadUserWithTwoFactor = async (id) => {
  const user = await User.findById(id).select(TWO_FACTOR_FIELDS);
  if (!user) throw new AppError('User account not found', 404);
  return user;
};

// Owners and platform admins are strongly encouraged to use 2FA.
const isTwoFactorRecommended = (user) =>
  user.role === 'admin' || (user.memberships || []).some((m) => m.role === 'owner' && m.active !== false);

const remainingRecoveryCodes = (user) =>
  ((user.twoFactor && user.twoFactor.recoveryCodes) || []).filter((c) => !c.usedAt).length;

// Accepts a TOTP code once (atomic replay protection). Returns true on success.
const consumeTotp = async (user, code) => {
  const secret = twoFactor.decryptSecret(user.twoFactor && user.twoFactor.secret);
  if (!secret) return false;
  const lastStep = user.twoFactor.lastUsedStep;
  const step = await twoFactor.verifyTotp(secret, code, typeof lastStep === 'number' ? lastStep : null);
  if (step === null) return false;
  const updated = await User.updateOne(
    {
      _id: user._id,
      'twoFactor.enabled': true,
      $or: [{ 'twoFactor.lastUsedStep': null }, { 'twoFactor.lastUsedStep': { $lt: step } }],
    },
    { $set: { 'twoFactor.lastUsedStep': step } }
  );
  return updated.modifiedCount === 1;
};

// Marks a matching unused recovery code as used (atomic, single-use).
const consumeRecoveryCode = async (user, recoveryCode) => {
  const normalised = twoFactor.normaliseRecoveryCode(recoveryCode);
  if (normalised.length < 8 || normalised.length > 32) return false;
  const hash = twoFactor.hashRecoveryCode(normalised);
  const updated = await User.updateOne(
    {
      _id: user._id,
      'twoFactor.enabled': true,
      'twoFactor.recoveryCodes': { $elemMatch: { hash, usedAt: null } },
    },
    { $set: { 'twoFactor.recoveryCodes.$.usedAt': new Date() } }
  );
  return updated.modifiedCount === 1;
};

// Verifies { code } or { recoveryCode }. Returns 'totp' | 'recovery' | null.
const verifySecondFactor = async (user, { code, recoveryCode } = {}) => {
  if (recoveryCode && typeof recoveryCode === 'string') {
    return (await consumeRecoveryCode(user, recoveryCode)) ? 'recovery' : null;
  }
  if (code !== undefined && code !== null && code !== '') {
    return (await consumeTotp(user, code)) ? 'totp' : null;
  }
  return null;
};

const requirePassword = async (user, password) => {
  if (!password || typeof password !== 'string') {
    throw new AppError('Please enter your current password', 400);
  }
  if (!(await user.matchPassword(password))) {
    throw new AppError('Current password does not match', 400);
  }
};

// @desc    Second login step: exchange a challenge token + code for a session.
//          body { challengeToken, code } or { challengeToken, recoveryCode }
// @route   POST /api/auth/login/2fa
// @access  Public (rate limited)
const loginTwoFactor = async (req, res) => {
  const { challengeToken, code, recoveryCode } = req.body || {};
  const decoded = twoFactor.verifyChallenge(challengeToken);
  if (!decoded) {
    throw new AppError('Your sign-in attempt expired. Please sign in again.', 401);
  }

  const user = await User.findById(decoded.sub).select(TWO_FACTOR_FIELDS);
  if (!user || !user.twoFactor || !user.twoFactor.enabled || (user.tokenVersion || 0) !== decoded.v) {
    throw new AppError('Your sign-in attempt expired. Please sign in again.', 401);
  }

  const method = await verifySecondFactor(user, { code, recoveryCode });
  if (!method) {
    await audit(req, {
      action: 'auth.2fa_failed',
      entity: 'User',
      entityId: user._id,
      userId: user._id,
      userName: user.name,
      meta: { method: recoveryCode ? 'recovery' : 'totp' },
    });
    return res.status(401).json({
      success: false,
      code: 'INVALID_2FA_CODE',
      message: recoveryCode ? 'Invalid or already used recovery code' : 'Invalid verification code',
    });
  }

  const access = await checkTenantAccess(user);
  if (access.blocked) return res.status(403).json(access.blocked);

  if (method === 'recovery') {
    await audit(req, {
      action: 'auth.2fa_recovery_used',
      entity: 'User',
      entityId: user._id,
      userId: user._id,
      userName: user.name,
      meta: { remaining: Math.max(0, remainingRecoveryCodes(user) - 1) },
    });
  }

  const body = await loginResponse(user, access.pharmacies);
  if (method === 'recovery') body.recoveryCodesRemaining = Math.max(0, remainingRecoveryCodes(user) - 1);
  return res.status(200).json(body);
};

// @desc    Two-factor status of the signed-in user
// @route   GET /api/auth/2fa/status
// @access  Private
const twoFactorStatus = async (req, res) => {
  const user = await loadUserWithTwoFactor(req.user._id);
  return res.status(200).json({
    success: true,
    enabled: Boolean(user.twoFactor && user.twoFactor.enabled),
    enabledAt: (user.twoFactor && user.twoFactor.enabledAt) || null,
    recoveryCodesRemaining: user.twoFactor && user.twoFactor.enabled ? remainingRecoveryCodes(user) : 0,
    recommended: isTwoFactorRecommended(user),
  });
};

// @desc    Start 2FA setup: creates a pending secret. body { password }
//          Returns { secret, otpauthUrl, qrCode } (qrCode is a PNG data URL).
// @route   POST /api/auth/2fa/setup
// @access  Private
const twoFactorSetup = async (req, res) => {
  const { password } = req.body || {};
  const user = await loadUserWithTwoFactor(req.user._id);
  await requirePassword(user, password);
  if (user.twoFactor && user.twoFactor.enabled) {
    throw new AppError('Two-factor login is already enabled. Disable it first to set up a new device.', 400);
  }

  const secret = twoFactor.newSecret();
  const otpauthUrl = twoFactor.otpauthUrl(secret, user.email);
  user.set('twoFactor.pendingSecret', twoFactor.encryptSecret(secret));
  user.set('twoFactor.pendingCreatedAt', new Date());
  await user.save();

  const qrCode = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
  return res.status(200).json({ success: true, secret, otpauthUrl, qrCode, issuer: twoFactor.ISSUER });
};

// @desc    Confirm setup with a code from the app. body { code }
//          Returns the recovery codes ONCE.
// @route   POST /api/auth/2fa/enable
// @access  Private
const twoFactorEnable = async (req, res) => {
  const { code } = req.body || {};
  const user = await loadUserWithTwoFactor(req.user._id);
  if (user.twoFactor && user.twoFactor.enabled) {
    throw new AppError('Two-factor login is already enabled', 400);
  }
  const pending = user.twoFactor && user.twoFactor.pendingSecret;
  const createdAt = user.twoFactor && user.twoFactor.pendingCreatedAt;
  if (!pending || !createdAt || Date.now() - new Date(createdAt).getTime() > twoFactor.SETUP_TTL_MS) {
    throw new AppError('The setup has expired. Please start again.', 400);
  }
  const secret = twoFactor.decryptSecret(pending);
  const step = await twoFactor.verifyTotp(secret, code);
  if (step === null) {
    throw new AppError('Invalid verification code. Check the time on your phone and try again.', 400);
  }

  const { codes, records } = twoFactor.generateRecoveryCodes();
  user.set('twoFactor', {
    enabled: true,
    enabledAt: new Date(),
    secret: pending,
    pendingSecret: null,
    pendingCreatedAt: null,
    lastUsedStep: step,
    recoveryCodes: records,
  });
  await user.save();

  await audit(req, { action: 'auth.2fa_enabled', entity: 'User', entityId: user._id });

  return res.status(200).json({
    success: true,
    enabled: true,
    recoveryCodes: codes,
    message: 'Two-factor login is now enabled. Save your recovery codes somewhere safe.',
  });
};

// @desc    Turn 2FA off. body { password, code } or { password, recoveryCode }
// @route   POST /api/auth/2fa/disable
// @access  Private
const twoFactorDisable = async (req, res) => {
  const { password, code, recoveryCode } = req.body || {};
  const user = await loadUserWithTwoFactor(req.user._id);
  await requirePassword(user, password);
  if (!user.twoFactor || !user.twoFactor.enabled) {
    throw new AppError('Two-factor login is not enabled', 400);
  }
  const method = await verifySecondFactor(user, { code, recoveryCode });
  if (!method) {
    throw new AppError(recoveryCode ? 'Invalid or already used recovery code' : 'Invalid verification code', 400);
  }

  await User.updateOne({ _id: user._id }, { $set: { twoFactor: { enabled: false, enabledAt: null } } });
  await audit(req, { action: 'auth.2fa_disabled', entity: 'User', entityId: user._id, meta: { method } });

  return res.status(200).json({ success: true, enabled: false, message: 'Two-factor login has been turned off.' });
};

// @desc    Replace the recovery codes. body { password, code }
// @route   POST /api/auth/2fa/recovery-codes
// @access  Private
const twoFactorRegenerateRecoveryCodes = async (req, res) => {
  const { password, code } = req.body || {};
  const user = await loadUserWithTwoFactor(req.user._id);
  await requirePassword(user, password);
  if (!user.twoFactor || !user.twoFactor.enabled) {
    throw new AppError('Two-factor login is not enabled', 400);
  }
  if (!(await consumeTotp(user, code))) {
    throw new AppError('Invalid verification code', 400);
  }

  const { codes, records } = twoFactor.generateRecoveryCodes();
  await User.updateOne({ _id: user._id }, { $set: { 'twoFactor.recoveryCodes': records } });
  await audit(req, { action: 'auth.2fa_recovery_regenerated', entity: 'User', entityId: user._id });

  return res.status(200).json({ success: true, recoveryCodes: codes });
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

// @desc    Platform admin turns off a user's two-factor login (lost phone and
//          recovery codes). Also revokes the user's existing sessions.
//          Admins cannot reset their own 2FA here (use /2fa/disable).
// @route   POST /api/auth/admin-reset-2fa/:userId
// @access  Admin
const adminResetTwoFactor = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) throw new AppError('Invalid user id', 400);
  if (String(userId) === String(req.user._id)) {
    throw new AppError('Use your own security settings to turn off two-factor login', 400);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);
  const wasEnabled = Boolean(user.twoFactor && user.twoFactor.enabled);

  await User.updateOne(
    { _id: user._id },
    { $set: { twoFactor: { enabled: false, enabledAt: null } }, $inc: { tokenVersion: 1 } }
  );
  await audit(req, {
    action: 'auth.admin_reset_2fa',
    entity: 'User',
    entityId: user._id,
    pharmacyId: (user.memberships || [])[0]?.pharmacyId || null,
    meta: { targetEmail: user.email, wasEnabled },
  });

  return res.status(200).json({
    success: true,
    wasEnabled,
    message: wasEnabled
      ? 'Two-factor login was turned off. The user can sign in with their password and set it up again.'
      : 'This user did not have two-factor login turned on.',
  });
};

module.exports = {
  login,
  loginTwoFactor,
  twoFactorStatus,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  twoFactorRegenerateRecoveryCodes,
  adminResetTwoFactor,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  adminResetPassword,
  changeUserPassword,
  MIN_PASSWORD_LENGTH,
};
