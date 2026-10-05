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
const { pharmacyScope } = require('../middleware/pharmacyScope');

// All stock routes restricted to authenticated pharmacist with pharmacyScope
router.use(protect);
router.use(authorize('pharmacist'));
router.use(pharmacyScope);

router.route('/')
  .get(getStockBatches)
  .post(addStockBatch);

router.get('/summary', getInventorySummary);
router.patch('/:id/adjust', adjustStock);
router.delete('/:id', deleteStockBatch);

module.exports = router;
