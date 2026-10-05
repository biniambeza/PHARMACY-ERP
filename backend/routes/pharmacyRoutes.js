const express = require('express');
const router = express.Router();
const {
  getMyPharmacy,
  updateMyPharmacy,
  updatePharmacistProfile,
} = require('../controllers/pharmacyController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');

// All pharmacy routes require login as pharmacist and valid pharmacyScope
router.use(protect);
router.use(authorize('pharmacist'));
router.use(pharmacyScope);

router.route('/my-pharmacy').get(getMyPharmacy).put(updateMyPharmacy);
router.put('/profile', updatePharmacistProfile);

module.exports = router;
