// Mounted at /api/returns: sales returns, refunds and voids (#2). Owner: Returns agent.
// Every route is authenticated and tenant-scoped (req.pharmacyId, req.membershipRole).
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const {
  createReturn,
  voidSale,
  getReturns,
  getReturnById,
} = require('../controllers/returnController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

router.route('/')
  .get(requirePermission('sales:view'), getReturns)
  .post(requirePermission('sales:return'), createReturn);
router.post('/void/:saleId', requirePermission('sales:void'), voidSale);
router.get('/:id', requirePermission('sales:view'), getReturnById);

module.exports = router;
