const express = require('express');
const router = express.Router();
const {
  getStaff,
  getStaffMember,
  createStaff,
  changeStaffRole,
  deactivateStaff,
  reactivateStaff,
} = require('../controllers/staffController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission } = require('../middleware/permission');
const pharmacyScope = require('../middleware/pharmacyScope');

// Staff management of the active pharmacy (owner only)
router.use(protect, authorize('pharmacist'), pharmacyScope, requirePermission('staff:manage'));

router.route('/').get(getStaff).post(createStaff);
router.get('/:userId', getStaffMember);
router.patch('/:userId/role', changeStaffRole);
router.patch('/:userId/deactivate', deactivateStaff);
router.patch('/:userId/reactivate', reactivateStaff);

module.exports = router;
