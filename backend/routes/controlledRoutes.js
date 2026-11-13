// Mounted at /api/controlled: controlled substances register (#17). Owner: Clinical agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { getRegister, getControlledMedicines } = require('../controllers/controlledController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

const canView = requirePermission('controlled:view');

router.get('/register', canView, getRegister);
router.get('/medicines', canView, getControlledMedicines);

module.exports = router;
