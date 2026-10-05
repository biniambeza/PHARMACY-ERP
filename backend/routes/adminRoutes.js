const express = require('express');
const router = express.Router();
const {
  createPharmacy,
  getPharmacies,
  togglePharmacyStatus,
  deletePharmacy,
  getSystemStats,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// All admin routes require login and the 'admin' role
router.use(protect);
router.use(authorize('admin'));

router.route('/pharmacies')
  .post(createPharmacy)
  .get(getPharmacies);

router.patch('/pharmacies/:id/toggle-status', togglePharmacyStatus);
router.delete('/pharmacies/:id', deletePharmacy);

router.get('/stats', getSystemStats);

module.exports = router;
