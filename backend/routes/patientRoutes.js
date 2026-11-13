// Mounted at /api/patients: patients (#16). Owner: Clinical agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const {
  getPatients, getPatient, createPatient, updatePatient, archivePatient, getPatientHistory,
} = require('../controllers/patientController');

// Patient records are tenant data: platform admins are kept out.
router.use(protect, authorize('pharmacist'), pharmacyScope);

const canView = requirePermission('patient:view');
const canManage = requirePermission('patient:manage');

router.route('/').get(canView, getPatients).post(canManage, createPatient);
router.get('/:id/history', canView, getPatientHistory);
router.route('/:id').get(canView, getPatient).put(canManage, updatePatient).delete(canManage, archivePatient);

module.exports = router;
