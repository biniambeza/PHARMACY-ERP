// Mounted at /api/admin/platform: subscriptions, announcements management,
// support mode (#24). Owner: Admin/Branches agent.
// Scaffolded by Foundation: platform admins only.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect, authorize('admin'));

module.exports = router;
