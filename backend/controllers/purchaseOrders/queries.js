const PurchaseOrder = require('../../models/PurchaseOrder');
const Supplier = require('../../models/Supplier');
const AppError = require('../../utils/AppError');
const escapeRegex = require('../../utils/escapeRegex');
const { parsePagination, isValidId } = require('./helpers');

// @desc    Get all purchase orders for logged-in pharmacy
// @route   GET /api/procurement/orders
// @access  Private (Pharmacist only)
const getPurchaseOrders = async (req, res) => {
  const { status } = req.query;
  // ?q= is an alias of ?search=
  const search = req.query.search || req.query.q;
  const query = { pharmacyId: req.pharmacyId };

  if (status) {
    // Accepts one status or a comma-separated list (e.g. "ordered,partially_received").
    const list = String(status).split(',').map((x) => x.trim()).filter(Boolean);
    query.status = list.length > 1 ? { $in: list } : list[0];
  }

  if (search) {
    const term = String(search).trim().slice(0, 100);
    const pattern = escapeRegex(term);
    // PO number, or the supplier's name
    const supplierIds = await Supplier.find({
      pharmacyId: req.pharmacyId,
      name: { $regex: pattern, $options: 'i' },
    }).distinct('_id');
    query.$or = [{ poNumber: { $regex: pattern, $options: 'i' } }, { supplierId: { $in: supplierIds } }];
  }

  const pagination = parsePagination(req.query);
  const findQuery = PurchaseOrder.find(query)
    .select('-__v')
    .populate('supplierId', 'name contactPerson phone email')
    .populate('pharmacistId', 'name email')
    .populate('receipts.receivedBy', 'name')
    .sort({ createdAt: -1, _id: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  const [orders, total] = await Promise.all([findQuery, PurchaseOrder.countDocuments(query)]);

  return res.status(200).json({
    success: true,
    count: orders.length,
    total,
    page: pagination.page,
    limit: pagination.limit,
    pages: Math.ceil(total / pagination.limit),
    truncated: pagination.skip + orders.length < total,
    orders,
  });
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
