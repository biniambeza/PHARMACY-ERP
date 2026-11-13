const { can } = require('../config/permissions');

// Platform admins on tenant routes are read-only ("support mode"): they pass
// permission checks on GET/HEAD/OPTIONS, but any write is refused unless the
// route explicitly opts in with allowAdminWrite (or a supportMode({ allow })
// rule), which sets req.adminWriteAllowed.
const ADMIN_READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const adminDecision = (req, res, next) => {
  if (ADMIN_READ_METHODS.includes(String(req.method).toUpperCase()) || req.adminWriteAllowed === true) {
    return next();
  }
  return res.status(403).json({
    success: false,
    code: 'SUPPORT_READ_ONLY',
    message: 'Platform admins have read-only access to pharmacy data (support mode)',
  });
};

// Requires the current membership role (set by pharmacyScope as
// req.membershipRole) to have ALL of the given permissions.
// Platform admins pass for reads only (see adminDecision above).
// Must run after `protect` and `pharmacyScope`.
const requirePermission = (...perms) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.role === 'admin') return adminDecision(req, res, next);

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
  if (req.user.role === 'admin') return adminDecision(req, res, next);
  if (perms.some((p) => can(req.membershipRole, p))) return next();
  return res.status(403).json({
    success: false,
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action',
    missing: perms,
  });
};

// Explicit opt-in for a route where a platform admin may write.
// Mount it BEFORE requirePermission, e.g.
//   router.post('/x', allowAdminWrite, requirePermission('...'), handler)
const allowAdminWrite = (req, res, next) => {
  req.adminWriteAllowed = true;
  return next();
};

module.exports = { requirePermission, requireAnyPermission, allowAdminWrite, ADMIN_READ_METHODS };
