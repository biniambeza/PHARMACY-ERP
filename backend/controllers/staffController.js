const mongoose = require('mongoose');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { ensureMemberships, sameId } = require('../utils/membership');
const { MIN_PASSWORD_LENGTH } = require('./authController');

const STAFF_ROLES = User.MEMBERSHIP_ROLES; // owner, pharmacist, cashier, storekeeper
const { isValidEmail } = require('../utils/email');

const membershipOf = (user, pharmacyId) =>
  (user.memberships || []).find((m) => sameId(m.pharmacyId, pharmacyId));

const toStaff = (user, pharmacyId) => {
  const m = membershipOf(user, pharmacyId);
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: m ? m.role : null,
    active: m ? m.active !== false : false,
    createdAt: user.createdAt,
  };
};

// Makes sure the legacy owner of the active pharmacy has a membership, so the
// "last owner" checks below see them.
const ensureOwnerMigrated = async (pharmacy) => {
  if (!pharmacy || !pharmacy.owner) return;
  const owner = await User.findById(pharmacy.owner).select('-password');
  if (owner) await ensureMemberships(owner);
};

const countActiveOwners = (pharmacyId, session) =>
  User.countDocuments({
    memberships: { $elemMatch: { pharmacyId, role: 'owner', active: true } },
  }).session(session || null);

const parseUserId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid id', 400);
  return id;
};

// Loads a user that has a membership in the active pharmacy.
const loadStaffMember = async (req) => {
  const user = await User.findOne({
    _id: parseUserId(req.params.userId),
    'memberships.pharmacyId': req.pharmacyId,
  });
  if (!user) throw new AppError('Staff member not found', 404);
  return user;
};

// @desc    List staff of the active pharmacy
// @route   GET /api/staff
// @access  staff:manage
const getStaff = async (req, res) => {
  await ensureOwnerMigrated(req.pharmacy);
  const users = await User.find({ 'memberships.pharmacyId': req.pharmacyId })
    .select('name email memberships createdAt')
    .sort({ createdAt: 1 })
    .lean();
  const staff = users.map((u) => toStaff(u, req.pharmacyId));
  return res.status(200).json({ success: true, count: staff.length, staff });
};

// @desc    Create a staff account (or add an existing user of the same organization)
// @route   POST /api/staff   { name, email, password, role }
// @access  staff:manage
const createStaff = async (req, res) => {
  const { name, email, password, role } = req.body || {};

  if (!STAFF_ROLES.includes(role)) {
    throw new AppError(`Role must be one of: ${STAFF_ROLES.join(', ')}`, 400);
  }
  if (typeof email !== 'string' || !isValidEmail(email.trim().toLowerCase())) {
    throw new AppError('Please provide a valid email address', 400);
  }
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    // Existing users can only be added when they already work for the same
    // organization (another branch); otherwise the email is taken.
    const sameOrg =
      existing.role === 'pharmacist' &&
      req.pharmacy.organizationId &&
      existing.organizationId &&
      sameId(existing.organizationId, req.pharmacy.organizationId);
    if (!sameOrg) throw new AppError('A user with this email already exists', 409);
    if (membershipOf(existing, req.pharmacyId)) {
      throw new AppError('This user is already a staff member of this pharmacy', 409);
    }
    existing.memberships.push({ pharmacyId: req.pharmacyId, role, active: true });
    await existing.save();
    await audit(req, {
      action: 'staff.add',
      entity: 'User',
      entityId: existing._id,
      after: { role, active: true },
      meta: { email: existing.email },
    });
    return res.status(201).json({
      success: true,
      message: 'Existing user added to this pharmacy',
      staff: toStaff(existing, req.pharmacyId),
    });
  }

  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('Please provide a name', 400);
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters long`, 400);
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
    role: 'pharmacist',
    organizationId: req.pharmacy.organizationId || null,
    memberships: [{ pharmacyId: req.pharmacyId, role, active: true }],
  });

  await audit(req, {
    action: 'staff.create',
    entity: 'User',
    entityId: user._id,
    after: { name: user.name, email: user.email, role, active: true },
  });

  return res.status(201).json({
    success: true,
    message: 'Staff account created',
    staff: toStaff(user, req.pharmacyId),
  });
};

// Runs `mutate(user, membership)` on the staff member's membership in the active
// pharmacy inside a transaction, refusing changes that leave no active owner.
const updateMembership = async (req, mutate) => {
  await ensureOwnerMigrated(req.pharmacy);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({
        _id: parseUserId(req.params.userId),
        'memberships.pharmacyId': req.pharmacyId,
      }).session(session);
      if (!user) throw new AppError('Staff member not found', 404);
      const membership = membershipOf(user, req.pharmacyId);
      const before = { role: membership.role, active: membership.active !== false };

      const extra = mutate(user, membership) || {};
      const after = { role: membership.role, active: membership.active !== false };

      const wasOwner = before.role === 'owner' && before.active;
      const stillOwner = after.role === 'owner' && after.active;
      if (wasOwner && !stillOwner) {
        const owners = await countActiveOwners(req.pharmacyId, session);
        if (owners <= 1) {
          throw new AppError('A pharmacy must keep at least one active owner', 400);
        }
      }

      if (extra.revokeSessions) user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save({ session });
      result = { user, before, after };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

// @desc    Change a staff member's role in the active pharmacy
// @route   PATCH /api/staff/:userId/role   { role }
// @access  staff:manage
const changeStaffRole = async (req, res) => {
  const { role } = req.body || {};
  if (!STAFF_ROLES.includes(role)) {
    throw new AppError(`Role must be one of: ${STAFF_ROLES.join(', ')}`, 400);
  }
  const { user, before, after } = await updateMembership(req, (u, m) => {
    m.role = role;
    u.markModified('memberships');
  });
  await audit(req, { action: 'staff.role_change', entity: 'User', entityId: user._id, before, after });
  return res.status(200).json({
    success: true,
    message: 'Staff role updated',
    staff: toStaff(user, req.pharmacyId),
  });
};

// @desc    Deactivate a staff member in the active pharmacy (revokes their sessions)
// @route   PATCH /api/staff/:userId/deactivate
// @access  staff:manage
const deactivateStaff = async (req, res) => {
  const { user, before, after } = await updateMembership(req, (u, m) => {
    m.active = false;
    u.markModified('memberships');
    return { revokeSessions: true };
  });
  await audit(req, { action: 'staff.deactivate', entity: 'User', entityId: user._id, before, after });
  return res.status(200).json({
    success: true,
    message: 'Staff member deactivated',
    staff: toStaff(user, req.pharmacyId),
  });
};

// @desc    Reactivate a staff member in the active pharmacy
// @route   PATCH /api/staff/:userId/reactivate
// @access  staff:manage
const reactivateStaff = async (req, res) => {
  const { user, before, after } = await updateMembership(req, (u, m) => {
    m.active = true;
    u.markModified('memberships');
  });
  await audit(req, { action: 'staff.reactivate', entity: 'User', entityId: user._id, before, after });
  return res.status(200).json({
    success: true,
    message: 'Staff member reactivated',
    staff: toStaff(user, req.pharmacyId),
  });
};

// @desc    Get one staff member of the active pharmacy
// @route   GET /api/staff/:userId
// @access  staff:manage
const getStaffMember = async (req, res) => {
  const user = await loadStaffMember(req);
  return res.status(200).json({ success: true, staff: toStaff(user, req.pharmacyId) });
};

module.exports = {
  getStaff,
  getStaffMember,
  createStaff,
  changeStaffRole,
  deactivateStaff,
  reactivateStaff,
  STAFF_ROLES,
};
