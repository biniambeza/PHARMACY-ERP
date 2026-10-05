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
const pharmacyScope = require('../middleware/pharmacyScope');

// All sales routes are strictly restricted to authenticated pharmacists of their own pharmacy tenant
router.use(protect, authorize('pharmacist'), pharmacyScope);

router.route('/').post(createSale).get(getSales);
router.get('/summary', getSalesSummary);
router.get('/:id', getSaleById);

module.exports = router;
