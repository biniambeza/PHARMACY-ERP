const express = require('express');
const router = express.Router();
const {
  getFinancialAnalytics,
  getDashboardOverview,
  getProfitReport,
  getSalesByStaff,
  getSalesByShift,
  getSlowMovingStock,
  getExpiryLoss,
  getTaxSummary,
  getPeriodComparison,
} = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission } = require('../middleware/permission');
const pharmacyScope = require('../middleware/pharmacyScope');

// All report routes require an authenticated pharmacist belonging to the pharmacy tenant.
// Range-based endpoints accept ?range=today|7d|monthly|yearly|all|custom (&from=YYYY-MM-DD&to=YYYY-MM-DD).
router.use(protect, authorize('pharmacist'), pharmacyScope);

router.get('/overview', requirePermission('dashboard:view'), getDashboardOverview);
router.get('/analytics', requirePermission('reports:view'), getFinancialAnalytics);
router.get('/profit', requirePermission('reports:view'), getProfitReport);
router.get('/sales-by-staff', requirePermission('reports:view'), getSalesByStaff);
router.get('/sales-by-shift', requirePermission('reports:view'), getSalesByShift);
router.get('/slow-moving', requirePermission('reports:view'), getSlowMovingStock);
router.get('/expiry-loss', requirePermission('reports:view'), getExpiryLoss);
router.get('/tax-summary', requirePermission('reports:view'), getTaxSummary);
router.get('/comparison', requirePermission('reports:view'), getPeriodComparison);

module.exports = router;
