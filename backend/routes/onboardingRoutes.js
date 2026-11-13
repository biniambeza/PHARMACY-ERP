// Mounted at /api/onboarding: first-run setup checklist for new pharmacies.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { getStatus, dismiss, restore } = require('../controllers/onboardingController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

router.get('/status', getStatus);
router.post('/dismiss', requirePermission('settings:manage'), dismiss);
router.delete('/dismiss', requirePermission('settings:manage'), restore);

module.exports = router;
