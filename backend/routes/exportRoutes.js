// Mounted at /api/export: export and print (#20). Owner: Insights agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { exportEntity, EXPORT_ENTITIES } = require('../controllers/exportController');

router.use(protect, pharmacyScope);

// GET /api/export/:entity?format=xlsx|csv&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', requirePermission('data:export'), (req, res) => res.json({ success: true, entities: EXPORT_ENTITIES }));
router.get('/:entity', requirePermission('data:export'), exportEntity);

module.exports = router;
