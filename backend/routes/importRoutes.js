// Mounted at /api/import: data import (#28). Owner: Catalog agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { parseFile, importMedicines, importOpeningStock } = require('../controllers/importController');

router.use(protect, pharmacyScope);

const canImport = requirePermission('data:import');

router.post('/parse', canImport, parseFile);
router.post('/medicines', canImport, importMedicines);
router.post('/opening-stock', canImport, importOpeningStock);

module.exports = router;
