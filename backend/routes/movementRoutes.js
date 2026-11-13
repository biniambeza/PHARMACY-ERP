// Mounted at /api/movements: stock movement history (#15). Owner: Catalog agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { getMovements } = require('../controllers/movementController');

router.use(protect, pharmacyScope);

router.get('/', requirePermission('stock:view'), getMovements);

module.exports = router;
