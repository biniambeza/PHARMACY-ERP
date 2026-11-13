// Mounted at /api/transfers: stock transfers between branches (#23). Owner: Admin/Branches agent.
// Every route is authenticated and tenant-scoped (req.pharmacyId, req.membershipRole).
// Platform admins get read-only support mode (GET only, x-pharmacy-id required).
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const pharmacyScope = require('../middleware/pharmacyScope');
const { requirePermission } = require('../middleware/permission');
const { supportReadOnly } = require('../middleware/supportMode');
const {
  getDestinations,
  listTransfers,
  getTransfer,
  createTransfer,
  sendTransfer,
  receiveTransfer,
  cancelTransfer,
  getConsolidated,
} = require('../controllers/transferController');

router.use(protect, pharmacyScope, supportReadOnly);

// Ownership of the organization is checked in the controller
router.get('/consolidated', getConsolidated);
router.get('/destinations', requirePermission('transfer:manage'), getDestinations);

router
  .route('/')
  .get(requirePermission('transfer:manage'), listTransfers)
  .post(requirePermission('transfer:manage'), createTransfer);

router.get('/:id', requirePermission('transfer:manage'), getTransfer);
router.post('/:id/send', requirePermission('transfer:manage'), sendTransfer);
router.post('/:id/receive', requirePermission('transfer:manage'), receiveTransfer);
router.post('/:id/cancel', requirePermission('transfer:manage'), cancelTransfer);

module.exports = router;
