// Mounted at /api/payments: mobile money payments (#26). Owner: POS agent.
// The public provider webhook lives in paymentWebhookRoutes.js (mounted before this router).
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { getProviders, createIntent, getIntent, cancelIntent } = require('../controllers/paymentController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

router.get('/providers', requirePermission('sales:create'), getProviders);
router.post('/intents', requirePermission('sales:create'), createIntent);
router.get('/intents/:id', requirePermission('sales:create'), getIntent);
router.post('/intents/:id/cancel', requirePermission('sales:create'), cancelIntent);

module.exports = router;
