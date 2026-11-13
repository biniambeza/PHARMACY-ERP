const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
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

module.exports = {
  login,
  getMe,
  changePassword,
  changeUserPassword,
  MIN_PASSWORD_LENGTH,
};
