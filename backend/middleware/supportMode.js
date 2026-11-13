const Pharmacy = require('../models/Pharmacy');

// Read-only "support mode" for platform admins on tenant (pharmacy) routers (#24).
//
// How Foundation handles admins:
//  - pharmacyScope: for admins it only sets req.pharmacyId from the
//    `x-pharmacy-id` header (or ?pharmacyId=), no req.pharmacy / membershipRole.
//  - requirePermission / requireAnyPermission let admins through.
//  - Most legacy tenant routers add authorize('pharmacist'), which keeps
//    admins out completely.
//
// This middleware (mount it AFTER protect + pharmacyScope) turns the admin
// pass-through into a safe, read-only view of ONE pharmacy:
//  - tenant users: untouched (next()).
//  - admins: only GET/HEAD/OPTIONS (plus explicit `allow` rules) are accepted,
//    anything else is 403 SUPPORT_READ_ONLY;
//    a target pharmacy (x-pharmacy-id) is required (400 SUPPORT_PHARMACY_REQUIRED),
//    it must exist (404); then req.pharmacy, req.membershipRole = 'owner'
//    (maximum READ visibility) and req.supportMode = true are set, and the
//    response carries `x-support-mode: read-only`.
//
// To open a legacy router to support mode, replace
//   router.use(protect, authorize('pharmacist'), pharmacyScope)
// with
//   router.use(protect, pharmacyScope, supportMode())
//
// Options: supportMode({ allow: [{ method: 'POST', path: '/export' | /regex/ }] })
const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const matchesRule = (req, rule) => {
  if (!rule) return false;
  const method = String(rule.method || 'GET').toUpperCase();
  if (method !== '*' && method !== req.method.toUpperCase()) return false;
  if (rule.path instanceof RegExp) return rule.path.test(req.path);
  return typeof rule.path === 'string' && rule.path === req.path;
};

const supportMode = ({ allow = [] } = {}) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.role !== 'admin') return next();

  const method = req.method.toUpperCase();
  if (!READ_METHODS.includes(method) && !allow.some((rule) => matchesRule(req, rule))) {
    return res.status(403).json({
      success: false,
      code: 'SUPPORT_READ_ONLY',
      message: 'Support mode is read-only',
    });
  }

  if (!req.pharmacyId) {
    return res.status(400).json({
      success: false,
      code: 'SUPPORT_PHARMACY_REQUIRED',
      message: 'Select a pharmacy (x-pharmacy-id header) to use support mode',
    });
  }

  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  if (!pharmacy) {
    return res.status(404).json({ success: false, message: 'Pharmacy not found' });
  }

  req.pharmacy = pharmacy;
  req.membershipRole = 'owner';
  req.supportMode = true;
  res.set('x-support-mode', 'read-only');
  return next();
};

// Ready-made instance with no write exceptions
const supportReadOnly = supportMode();

module.exports = { supportMode, supportReadOnly, READ_METHODS };
