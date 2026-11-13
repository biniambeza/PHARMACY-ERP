// Mounted at /api/payables: supplier invoices and payments (#10). Owner: Finance agent.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const c = require('../controllers/payableController');

router.use(protect, pharmacyScope);

const canView = requirePermission('supplier:view');
const canPay = requirePermission('supplier:pay');

router.get('/aging', canView, c.getAging);
router.get('/balances', canView, c.getBalances);
router.get('/suppliers/:supplierId', canView, c.getSupplierAccount);
router.route('/invoices').get(canView, c.getInvoices).post(canPay, c.createInvoice);
router.route('/invoices/:id').get(canView, c.getInvoiceById).put(canPay, c.updateInvoice).delete(canPay, c.deleteInvoice);
router.route('/payments').get(canView, c.getPayments).post(canPay, c.recordPayment);

module.exports = router;
