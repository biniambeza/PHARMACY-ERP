// Mounted at /api/reorder: reorder suggestions and auto-PO (#12). Owner: Procurement agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { getSuggestions, createPurchaseOrders } = require('../controllers/reorderController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

router.get('/suggestions', requirePermission('po:view'), getSuggestions);
router.post('/create-pos', requirePermission('po:manage'), createPurchaseOrders);

module.exports = router;
