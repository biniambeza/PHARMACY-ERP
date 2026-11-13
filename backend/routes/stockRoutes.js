const express = require('express');
const router = express.Router();
const {
  getStockBatches,
  addStockBatch,
  adjustStock,
  getInventorySummary,
  deleteStockBatch,
} = require('../controllers/stockController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission, requireAnyPermission } = require('../middleware/permission');
const { pharmacyScope } = require('../middleware/pharmacyScope');

// All stock routes restricted to authenticated pharmacist with pharmacyScope
router.use(protect);
router.use(authorize('pharmacist'));
router.use(pharmacyScope);

router.route('/')
  // The POS (sales:create) looks up FEFO batches without full inventory access
  .get(requireAnyPermission('stock:view', 'sales:create'), getStockBatches)
  .post(requirePermission('stock:in'), addStockBatch);

router.get('/summary', requirePermission('stock:view'), getInventorySummary);
router.patch('/:id/adjust', requirePermission('stock:adjust'), adjustStock);
router.delete('/:id', requirePermission('stock:adjust'), deleteStockBatch);

module.exports = router;
