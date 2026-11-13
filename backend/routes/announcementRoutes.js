// Mounted at /api/announcements: announcements shown to pharmacies (#24). Owner: Admin/Branches agent.
// Every route is authenticated and tenant-scoped (req.pharmacyId). Admins manage
// announcements under /api/admin/platform/announcements; here they only get
// read-only support mode.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { supportReadOnly } = require('../middleware/supportMode');
const { getActiveAnnouncements } = require('../controllers/announcementController');

router.use(protect, pharmacyScope, supportReadOnly);

// Any staff member of the pharmacy
router.get('/active', getActiveAnnouncements);

module.exports = router;
