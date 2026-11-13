const express = require('express');
const router = express.Router();
const {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getCategories,
  lookupMedicine,
  generateBarcode,
  previewBulkPrice,
  applyBulkPrice,
  getPriceHistory,
} = require('../controllers/medicineController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission } = require('../middleware/permission');
const { pharmacyScope } = require('../middleware/pharmacyScope');

// Restrict all routes to authenticated pharmacists with isolated pharmacy scope
router.use(protect);
router.use(authorize('pharmacist'));
router.use(pharmacyScope);

const canView = requirePermission('medicine:view');
const canManage = requirePermission('medicine:manage');
const canPrice = requirePermission('price:manage');

router.route('/')
  .get(canView, getMedicines)
  .post(canManage, createMedicine);

router.get('/categories', canView, getCategories);
// Barcode / pack barcode / SKU lookup (used by the POS and stock-in scanner)
router.get('/lookup', canView, lookupMedicine);
router.post('/bulk-price/preview', canPrice, previewBulkPrice);
router.post('/bulk-price', canPrice, applyBulkPrice);

router.route('/:id')
  .get(canView, getMedicineById)
  .put(canManage, updateMedicine)
  .delete(canManage, deleteMedicine);

router.get('/:id/price-history', canView, getPriceHistory);
router.post('/:id/generate-barcode', canManage, generateBarcode);

module.exports = router;
