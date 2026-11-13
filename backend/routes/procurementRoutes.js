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
const { requirePermission } = require('../middleware/permission');
const pharmacyScope = require('../middleware/pharmacyScope');

// All procurement routes require an authenticated pharmacist belonging to the pharmacy tenant
router.use(protect, authorize('pharmacist'), pharmacyScope);

router.route('/orders')
  .get(requirePermission('po:view'), getPurchaseOrders)
  .post(requirePermission('po:manage'), createPurchaseOrder);
router.route('/orders/:id').get(requirePermission('po:view'), getPurchaseOrderById);
router.patch('/orders/:id/receive', requirePermission('po:receive'), receivePurchaseOrder);
router.patch('/orders/:id/cancel', requirePermission('po:manage'), cancelPurchaseOrder);

module.exports = router;
