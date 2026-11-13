// Mounted at /api/audit: audit log (#19). Owner: Insights agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { listAuditLogs, getAuditFacets, getAuditLog } = require('../controllers/auditController');

router.use(protect, pharmacyScope);

// Read-only: audit entries can never be edited or deleted through the API.
router.get('/', requirePermission('audit:view'), listAuditLogs);
router.get('/facets', requirePermission('audit:view'), getAuditFacets);
router.get('/:id', requirePermission('audit:view'), getAuditLog);

module.exports = router;
