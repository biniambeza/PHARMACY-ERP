// Mounted at /api/prescriptions: prescriptions and refill tracking (#16). Owner: Clinical agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const {
  getPrescriptions, getPrescription, createPrescription, updatePrescription, getRefillsDue,
} = require('../controllers/prescriptionController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

const canView = requirePermission('patient:view');
const canManage = requirePermission('prescription:manage');

router.route('/').get(canView, getPrescriptions).post(canManage, createPrescription);
router.get('/refills-due', canView, getRefillsDue);
router.route('/:id').get(canView, getPrescription).put(canManage, updatePrescription);

module.exports = router;
