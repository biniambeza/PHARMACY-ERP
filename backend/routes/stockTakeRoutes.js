// Mounted at /api/stock-takes: stock take (#11). Owner: Catalog agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const {
  startStockTake,
  listStockTakes,
  getStockTake,
  getVarianceReport,
  saveCounts,
  submitStockTake,
  reopenStockTake,
  approveStockTake,
  cancelStockTake,
} = require('../controllers/stockTakeController');

router.use(protect, pharmacyScope);

const canTake = requirePermission('stock:take');
// Approving writes stock corrections: needs stock:adjust as well (owner / pharmacist / storekeeper)
const canApprove = requirePermission('stock:take', 'stock:adjust');

router.route('/').get(canTake, listStockTakes).post(canTake, startStockTake);
router.get('/:id', canTake, getStockTake);
router.get('/:id/variance', canTake, getVarianceReport);
router.patch('/:id/counts', canTake, saveCounts);
router.post('/:id/submit', canTake, submitStockTake);
router.post('/:id/reopen', canTake, reopenStockTake);
router.post('/:id/approve', canApprove, approveStockTake);
router.post('/:id/cancel', canTake, cancelStockTake);

module.exports = router;
