// Mounted at /api/shifts: cash drawer shifts (#7). Owner: POS agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requireAnyPermission } = require('../middleware/permission');
const {
  openShift,
  getCurrentShift,
  closeShift,
  getShifts,
  getShift,
  getZReport,
} = require('../controllers/shiftController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

// shift:own = own shifts; shift:manage = every shift of the pharmacy (checked in the controller)
const shiftAccess = requireAnyPermission('shift:own', 'shift:manage');

router.post('/open', shiftAccess, openShift);
router.get('/current', shiftAccess, getCurrentShift);
router.get('/', shiftAccess, getShifts);
router.get('/:id', shiftAccess, getShift);
router.get('/:id/z-report', shiftAccess, getZReport);
router.post('/:id/close', shiftAccess, closeShift);

module.exports = router;
