// Mounted at /api/receipts: digital receipts (SMS / email / plain text of a sale receipt).
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { getReceiptText, sendReceipt } = require('../controllers/receiptController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

router.get('/:saleId/text', requirePermission('sales:view'), getReceiptText);
router.post('/:saleId/send', requirePermission('sales:view'), sendReceipt);

module.exports = router;
