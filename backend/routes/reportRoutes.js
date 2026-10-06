const express = require('express');
const router = express.Router();
const { getFinancialAnalytics, getDashboardOverview } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');

// All report routes require an authenticated pharmacist belonging to the pharmacy tenant
router.use(protect, authorize('pharmacist'), pharmacyScope);

router.get('/analytics', getFinancialAnalytics);
router.get('/overview', getDashboardOverview);

module.exports = router;
