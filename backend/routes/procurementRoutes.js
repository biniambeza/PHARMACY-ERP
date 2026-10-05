const express = require('express');
const router = express.Router();
const {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
} = require('../controllers/purchaseOrderController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');

// All procurement routes require an authenticated pharmacist belonging to the pharmacy tenant
router.use(protect, authorize('pharmacist'), pharmacyScope);

router.route('/orders').get(getPurchaseOrders).post(createPurchaseOrder);
router.route('/orders/:id').get(getPurchaseOrderById);
router.patch('/orders/:id/receive', receivePurchaseOrder);
router.patch('/orders/:id/cancel', cancelPurchaseOrder);

module.exports = router;
