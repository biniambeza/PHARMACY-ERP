const PurchaseOrder = require('../../models/PurchaseOrder');
const AppError = require('../../utils/AppError');
const { audit } = require('../../utils/audit');
const { isValidId } = require('./helpers');

// @desc    Submit a draft purchase order to the supplier (draft -> ordered)
// @route   PATCH /api/procurement/orders/:id/submit
// @access  po:manage
const submitPurchaseOrder = async (req, res) => {
  if (!isValidId(req.params.id)) throw new AppError('Invalid purchase order id', 400);

  const order = await PurchaseOrder.findOneAndUpdate(
    { _id: req.params.id, pharmacyId: req.pharmacyId, status: 'draft' },
    { status: 'ordered', orderDate: new Date() },
    { returnDocument: 'after' }
  );

  if (!order) {
    const existing = await PurchaseOrder.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
    if (!existing) throw new AppError('Purchase order not found', 404);
    throw new AppError(`Only draft orders can be submitted (this one is ${existing.status})`, 400);
  }

  await audit(req, { action: 'po.submit', entity: 'PurchaseOrder', entityId: order._id, after: { status: order.status } });

  return res.status(200).json({ success: true, message: 'Purchase order submitted', order });
};

// @desc    Close a partially received order short (remaining quantities will not be delivered)
// @route   POST /api/procurement/orders/:id/close
// @access  po:manage
const closePurchaseOrder = async (req, res) => {
  if (!isValidId(req.params.id)) throw new AppError('Invalid purchase order id', 400);
  const reason = typeof (req.body && req.body.reason) === 'string' ? req.body.reason.trim().slice(0, 500) : '';

  const order = await PurchaseOrder.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!order) throw new AppError('Purchase order not found', 404);
  if (order.status === 'ordered' || order.status === 'draft') {
    throw new AppError('Nothing has been received on this order yet. Cancel it instead.', 400);
  }

  const closed = await PurchaseOrder.findOneAndUpdate(
    { _id: order._id, pharmacyId: req.pharmacyId, status: 'partially_received' },
    { status: 'closed', closedAt: new Date(), closedBy: req.user._id, closeReason: reason },
    { returnDocument: 'after' }
  );
  if (!closed) {
    throw new AppError(`Only partially received orders can be closed (this one is ${order.status})`, 400);
  }

  await audit(req, {
    action: 'po.close_short',
    entity: 'PurchaseOrder',
    entityId: closed._id,
    before: { status: order.status },
    after: { status: closed.status },
    meta: {
      reason,
      shortLines: closed.items
        .filter((it) => it.quantityReceived < it.quantityOrdered)
        .map((it) => ({ medicineId: it.medicineId, name: it.name, short: it.quantityOrdered - it.quantityReceived })),
    },
  });

  return res.status(200).json({ success: true, message: 'Purchase order closed short', order: closed });
};

// @desc    Cancel purchase order
// @route   PATCH /api/procurement/orders/:id/cancel
// @access  po:manage
const cancelPurchaseOrder = async (req, res) => {
  if (!isValidId(req.params.id)) throw new AppError('Invalid purchase order id', 400);
  const order = await PurchaseOrder.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Purchase order not found',
    });
  }

  // Atomic status transition so a concurrent receive can't be overwritten.
  // Orders with deliveries recorded must be closed short instead.
  const cancelled = await PurchaseOrder.findOneAndUpdate(
    { _id: order._id, pharmacyId: req.pharmacyId, status: { $in: ['draft', 'ordered'] } },
    { status: 'cancelled' },
    { returnDocument: 'after' }
  );

  if (!cancelled) {
    const message =
      order.status === 'partially_received'
        ? 'This order has deliveries recorded. Close it short instead of cancelling.'
        : `Cannot cancel an order that is already ${['draft', 'ordered'].includes(order.status) ? 'processed' : order.status}`;
    return res.status(400).json({ success: false, message });
  }

  await audit(req, {
    action: 'po.cancel',
    entity: 'PurchaseOrder',
    entityId: cancelled._id,
    before: { status: order.status },
    after: { status: 'cancelled' },
  });

  return res.status(200).json({
    success: true,
    message: 'Purchase order cancelled successfully',
    order: cancelled,
  });
};

module.exports = {
  submitPurchaseOrder,
  closePurchaseOrder,
  cancelPurchaseOrder,
};
