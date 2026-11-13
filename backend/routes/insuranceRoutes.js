// Mounted at /api/insurance: insurance / credit-scheme billing (schemes, members, claims). Owner: Insurance agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const c = require('../controllers/insuranceController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

// insurance:view = POS lookups (cashiers too); insurance:manage = schemes/members; claim:manage = claims
const canView = requirePermission('insurance:view');
const canManage = requirePermission('insurance:manage');
const canClaim = requirePermission('claim:manage');

router.route('/schemes').get(canView, c.getSchemes).post(canManage, c.createScheme);
router.route('/schemes/:id').get(canView, c.getScheme).put(canManage, c.updateScheme).delete(canManage, c.deleteScheme);

router.get('/members/lookup', canView, c.lookupMembers);
router.route('/members').get(canView, c.getMembers).post(canManage, c.createMember);
router.route('/members/:id').put(canManage, c.updateMember).delete(canManage, c.deleteMember);

router.post('/preview', canView, c.previewSplit);

router.get('/receivables', canClaim, c.getReceivables);
router.get('/claims/unclaimed', canClaim, c.getUnclaimed);
router.route('/claims').get(canClaim, c.getClaims).post(canClaim, c.createClaim);
router.route('/claims/:id').get(canClaim, c.getClaim).delete(canClaim, c.deleteClaim);
router.get('/claims/:id/export', canClaim, c.exportClaim);
router.post('/claims/:id/refresh', canClaim, c.refreshClaim);
router.post('/claims/:id/submit', canClaim, c.submitClaim);
router.post('/claims/:id/payments', canClaim, c.recordClaimPayment);
router.post('/claims/:id/reject', canClaim, c.rejectClaim);

module.exports = router;
