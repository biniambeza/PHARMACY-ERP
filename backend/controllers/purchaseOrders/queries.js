const PurchaseOrder = require('../../models/PurchaseOrder');
const AppError = require('../../utils/AppError');
const escapeRegex = require('../../utils/escapeRegex');
const { parsePagination, isValidId } = require('./helpers');

// @desc    Get all purchase orders for logged-in pharmacy
// @route   GET /api/procurement/orders
// @access  Private (Pharmacist only)
const getPurchaseOrders = async (req, res) => {
  const { status, search } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (status) {
    // Accepts one status or a comma-separated list (e.g. "ordered,partially_received").
    const list = String(status).split(',').map((x) => x.trim()).filter(Boolean);
    query.status = list.length > 1 ? { $in: list } : list[0];
  }

  if (search) {
    query.poNumber = { $regex: escapeRegex(String(search)), $options: 'i' };
  }

  const pagination = parsePagination(req.query);
  let findQuery = PurchaseOrder.find(query)
    .populate('supplierId', 'name contactPerson phone email')
    .populate('pharmacistId', 'name email')
    .populate('receipts.receivedBy', 'name')
    .sort({ createdAt: -1 });
  if (pagination) {
    findQuery = findQuery.skip(pagination.skip).limit(pagination.limit);
  }

  const [orders, total] = await Promise.all([findQuery, PurchaseOrder.countDocuments(query)]);

  const response = {
    success: true,
    count: orders.length,
    total,
    orders,
  };
  if (pagination) {
    response.page = pagination.page;
    response.limit = pagination.limit;
    response.pages = Math.ceil(total / pagination.limit);
  }

  return res.status(200).json(response);
};

// @desc    Get single purchase order
// @route   GET /api/procurement/orders/:id
// @access  Private (Pharmacist only)
const getPurchaseOrderById = async (req, res) => {
  if (!isValidId(req.params.id)) throw new AppError('Invalid purchase order id', 400);
  const order = await PurchaseOrder.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  })
    .populate('supplierId', 'name contactPerson phone email address')
    .populate('pharmacistId', 'name email')
    .populate('items.medicineId', 'name genericName category dosageForm strength')
    .populate('receipts.receivedBy', 'name email')
    .populate('closedBy', 'name email');

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Purchase order not found',
    });
  }

  return res.status(200).json({
    success: true,
    order,
  });
};

module.exports = {
  getPurchaseOrders,
  getPurchaseOrderById,
};
