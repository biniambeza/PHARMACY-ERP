// Mounted at /api/interactions: drug interaction rules and allergy checks (#18). Owner: Clinical agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission, requireAnyPermission } = require('../middleware/permission');
const {
  listRules, createRule, updateRule, deleteRule, checkInteractions,
} = require('../controllers/interactionController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

const canManage = requirePermission('interaction:manage');

router.route('/rules')
  .get(requireAnyPermission('interaction:manage', 'patient:view'), listRules)
  .post(canManage, createRule);
router.route('/rules/:id').put(canManage, updateRule).delete(canManage, deleteRule);
// Used by the POS (cashiers too) and the clinical pages
router.post('/check', requireAnyPermission('sales:create', 'patient:view'), checkInteractions);

module.exports = router;
