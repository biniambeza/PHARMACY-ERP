// Mounted at /api/einvoice: fiscal e-invoicing (tax authority submission).
// Submission is explicit (single submit / batches); settings and batches are owner-only.
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const {
  getSettings,
  updateSettings,
  listInvoices,
  getInvoice,
  submitSale,
  issueCreditNote,
  retryFailed,
  submitPending,
} = require('../controllers/einvoiceController');

router.use(protect, authorize('pharmacist'), pharmacyScope);

const view = requirePermission('einvoice:view');
const manage = requirePermission('einvoice:manage');

router.get('/settings', view, getSettings);
router.put('/settings', manage, updateSettings);
router.post('/retry-failed', manage, retryFailed);
router.post('/submit-pending', manage, submitPending);
router.post('/submit/:saleId', view, submitSale);
router.post('/credit-note/:returnId', view, issueCreditNote);
router.get('/', view, listInvoices);
router.get('/:saleId', view, getInvoice);

module.exports = router;
