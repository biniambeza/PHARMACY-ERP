// Mounted at /api/audit: audit log (#19). Owner: Insights agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { supportReadOnly } = require('../middleware/supportMode');
const { requirePermission } = require('../middleware/permission');
const { listAuditLogs, getAuditFacets, getAuditLog } = require('../controllers/auditController');

// Platform admins: read-only support mode for one pharmacy (x-pharmacy-id)
router.use(protect, pharmacyScope, supportReadOnly);

// Read-only: audit entries can never be edited or deleted through the API.
router.get('/', requirePermission('audit:view'), listAuditLogs);
router.get('/facets', requirePermission('audit:view'), getAuditFacets);
router.get('/:id', requirePermission('audit:view'), getAuditLog);

module.exports = router;
