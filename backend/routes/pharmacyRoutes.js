const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { pharmacyScope } = require('../middleware/pharmacyScope');

// All pharmacy routes require login as pharmacist and valid pharmacyScope
router.use(protect);
router.use(authorize('pharmacist'));
router.use(pharmacyScope);

// @desc    Get logged in pharmacist's pharmacy profile (Data Isolation test)
// @route   GET /api/pharmacy/my-pharmacy
// @access  Private (Pharmacist only)
router.get('/my-pharmacy', (req, res) => {
  res.status(200).json({
    success: true,
    pharmacyId: req.pharmacyId,
    pharmacy: req.pharmacy,
  });
});

module.exports = router;
