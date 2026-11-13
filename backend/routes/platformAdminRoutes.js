// Mounted at /api/admin/platform: subscriptions, platform metrics, announcements
// management and read-only support views (#24). Owner: Admin/Branches agent.
// Platform admins only.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  listSubscriptions,
  updateSubscription,
  runSubscriptionCheck,
  getPlatformMetrics,
  getSupportOverview,
} = require('../controllers/platformAdminController');
const {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} = require('../controllers/announcementController');

router.use(protect, authorize('admin'));

router.get('/metrics', getPlatformMetrics);

router.get('/subscriptions', listSubscriptions);
router.post('/subscriptions/check', runSubscriptionCheck);
router.patch('/pharmacies/:id/subscription', updateSubscription);
router.get('/pharmacies/:id/support', getSupportOverview);

router.route('/announcements').get(listAnnouncements).post(createAnnouncement);
router.route('/announcements/:id').put(updateAnnouncement).delete(deleteAnnouncement);

module.exports = router;
