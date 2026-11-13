const express = require('express');
const router = express.Router();
const {
  getMyPharmacy,
  updateMyPharmacy,
  updatePharmacistProfile,
} = require('../controllers/pharmacyController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission } = require('../middleware/permission');
const pharmacyScope = require('../middleware/pharmacyScope');

// All pharmacy routes require login as pharmacist and valid pharmacyScope
router.use(protect);
router.use(authorize('pharmacist'));
router.use(pharmacyScope);

// Any staff member can read the active pharmacy (name on receipts etc.) and
// edit their own profile; changing pharmacy settings is owner-only.
router.route('/my-pharmacy')
  .get(getMyPharmacy)
  .put(requirePermission('settings:manage'), updateMyPharmacy);
router.put('/profile', updatePharmacistProfile);

module.exports = router;
