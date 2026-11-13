const express = require('express');
const router = express.Router();
const {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getCategories,
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

router.route('/')
  .get(canView, getMedicines)
  .post(canManage, createMedicine);

router.get('/categories', canView, getCategories);

router.route('/:id')
  .get(canView, getMedicineById)
  .put(canManage, updateMedicine)
  .delete(canManage, deleteMedicine);

module.exports = router;
