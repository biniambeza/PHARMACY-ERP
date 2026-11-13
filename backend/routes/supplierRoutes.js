const express = require('express');
const router = express.Router();
const {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} = require('../controllers/supplierController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { requirePermission } = require('../middleware/permission');
const pharmacyScope = require('../middleware/pharmacyScope');

// All supplier routes require an authenticated pharmacist belonging to the pharmacy tenant
router.use(protect, authorize('pharmacist'), pharmacyScope);

const canView = requirePermission('supplier:view');
const canManage = requirePermission('supplier:manage');

router.route('/').get(canView, getSuppliers).post(canManage, createSupplier);
router.route('/:id')
  .get(canView, getSupplierById)
  .put(canManage, updateSupplier)
  .delete(canManage, deleteSupplier);

module.exports = router;
