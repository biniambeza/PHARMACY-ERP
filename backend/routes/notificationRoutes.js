// Mounted at /api/notifications: in-app notifications (#5) and the expiry
// dashboard (#4). Owner: Notify agent.
// Every route is authenticated and tenant-scoped (req.pharmacyId, req.membershipRole).
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { supportReadOnly } = require('../middleware/supportMode');
const { requirePermission } = require('../middleware/permission');
const {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  runChecks,
  getExpiryOverview,
} = require('../controllers/notificationController');

// Platform admins: read-only support mode for one pharmacy (x-pharmacy-id)
router.use(protect, pharmacyScope, supportReadOnly);

router.get('/', requirePermission('notifications:view'), getNotifications);
router.get('/unread-count', requirePermission('notifications:view'), getUnreadCount);
router.get('/expiry-overview', requirePermission('stock:view'), getExpiryOverview);
router.post('/read-all', requirePermission('notifications:view'), markAllRead);
router.post('/run-checks', requirePermission('settings:manage'), runChecks);
router.patch('/:id/read', requirePermission('notifications:view'), markRead);

module.exports = router;
