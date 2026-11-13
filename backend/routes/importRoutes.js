// Mounted at /api/import: data import (#28). Owner: Catalog agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { supportReadOnly } = require('../middleware/supportMode');
const { requirePermission } = require('../middleware/permission');
const { parseFile, importMedicines, importOpeningStock } = require('../controllers/importController');

// Platform admins: read-only support mode for one pharmacy (x-pharmacy-id)
router.use(protect, pharmacyScope, supportReadOnly);

const canImport = requirePermission('data:import');

router.post('/parse', canImport, parseFile);
router.post('/medicines', canImport, importMedicines);
router.post('/opening-stock', canImport, importOpeningStock);

module.exports = router;
