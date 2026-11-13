const express = require('express');
const router = express.Router();
const {
  createSale,
  getSales,
  getSaleById,
  getSalesSummary,
} = require('../controllers/salesController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission } = require('../middleware/permission');
const pharmacyScope = require('../middleware/pharmacyScope');

// All sales routes are strictly restricted to authenticated pharmacists of their own pharmacy tenant
router.use(protect, authorize('pharmacist'), pharmacyScope);

router.route('/')
  .post(requirePermission('sales:create'), createSale)
  .get(requirePermission('sales:view'), getSales);
router.get('/summary', requirePermission('sales:view'), getSalesSummary);
router.get('/:id', requirePermission('sales:view'), getSaleById);

module.exports = router;
