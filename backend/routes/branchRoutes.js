const express = require('express');
const router = express.Router();
const { getMyBranches, createBranch } = require('../controllers/branchController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission } = require('../middleware/permission');
const pharmacyScope = require('../middleware/pharmacyScope');

router.use(protect, authorize('pharmacist'), pharmacyScope);

router.route('/').get(getMyBranches).post(requirePermission('branch:manage'), createBranch);

module.exports = router;
