const { can } = require('../config/permissions');

// Requires the current membership role (set by pharmacyScope as
// req.membershipRole) to have ALL of the given permissions.
// Platform admins pass (support mode); they are kept out of tenant routes by
// authorize('pharmacist') where that matters.
// Must run after `protect` and `pharmacyScope`.
const requirePermission = (...perms) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.role === 'admin') return next();

  const role = req.membershipRole;
  const missing = perms.filter((p) => !can(role, p));
  if (missing.length) {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action',
      missing,
    });
  }
  return next();
};

// Like requirePermission, but ANY one of the permissions is enough.
const requireAnyPermission = (...perms) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.role === 'admin') return next();
  if (perms.some((p) => can(req.membershipRole, p))) return next();
  return res.status(403).json({
    success: false,
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action',
    missing: perms,
  });
};

module.exports = { requirePermission, requireAnyPermission };
