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
const { pharmacyScope } = require('../middleware/pharmacyScope');

// Restrict all routes to authenticated pharmacists with isolated pharmacy scope
router.use(protect);
router.use(authorize('pharmacist'));
router.use(pharmacyScope);

router.route('/')
  .get(getMedicines)
  .post(createMedicine);

router.get('/categories', getCategories);

router.route('/:id')
  .get(getMedicineById)
  .put(updateMedicine)
  .delete(deleteMedicine);

module.exports = router;
