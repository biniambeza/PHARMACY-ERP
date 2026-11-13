// Mounted at /api/customers: credit customers (#6). Owner: Finance agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  recordPayment,
  getPayments,
  getStatement,
  getAging,
} = require('../controllers/customerController');

router.use(protect, pharmacyScope);

const canView = requirePermission('customer:view');
const canManage = requirePermission('customer:manage');

router.get('/aging', canView, getAging);
router.route('/').get(canView, getCustomers).post(canManage, createCustomer);
router.route('/:id').get(canView, getCustomerById).put(canManage, updateCustomer).delete(canManage, deleteCustomer);
router.route('/:id/payments').get(canView, getPayments).post(canManage, recordPayment);
router.get('/:id/statement', canView, getStatement);

module.exports = router;
