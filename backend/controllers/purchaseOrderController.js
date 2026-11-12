const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { recordMovement } = require('../utils/stockMovement');

const MAX_PAGE_LIMIT = 200;
const DEFAULT_PAGE_LIMIT = 50;

// Pagination is opt-in via `?page=`. Without it every match is returned.
const parsePagination = (query) => {
  if (query.page === undefined) return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
};

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const isValidId = (id) =>
  (typeof id === 'string' || id instanceof mongoose.Types.ObjectId) &&
  OBJECT_ID_PATTERN.test(String(id));

// Compare two dates by calendar day (UTC), which is how expiry dates are entered.
const sameDay = (a, b) =>
  new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// @desc    Get all purchase orders for logged-in pharmacy
// @route   GET /api/procurement/orders
// @access  Private (Pharmacist only)
const getPurchaseOrders = async (req, res) => {
  const { status, search } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (status) {
    query.status = String(status);
  }

  if (search) {
    query.poNumber = { $regex: escapeRegex(String(search)), $options: 'i' };
  }

  const pagination = parsePagination(req.query);
  let findQuery = PurchaseOrder.find(query)
    .populate('supplierId', 'name contactPerson phone email')
    .populate('pharmacistId', 'name email')
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
  const order = await PurchaseOrder.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  })
    .populate('supplierId', 'name contactPerson phone email address')
    .populate('pharmacistId', 'name email')
    .populate('items.medicineId', 'name genericName category dosageForm strength');

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

// @desc    Create new purchase order
// @route   POST /api/procurement/orders
// @access  Private (Pharmacist only)
const createPurchaseOrder = async (req, res) => {
  const { supplierId, items, expectedDelivery, notes } = req.body || {};

  if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
    throw new AppError('Please provide supplier and at least one item', 400);
  }

  if (!isValidId(supplierId)) {
    throw new AppError('Invalid supplier id', 400);
  }

  // Validate every line before touching the database
  const seen = new Set();
  const lines = items.map((it, idx) => {
    const medicineId = it && it.medicineId;
    if (!isValidId(medicineId)) {
      throw new AppError(`Item #${idx + 1} has an invalid or missing medicine`, 400);
    }
    const key = String(medicineId);
    if (seen.has(key)) {
      throw new AppError(
        'Each medicine can appear only once per purchase order. Combine the quantities into one line.',
        400
      );
    }
    seen.add(key);

    const qty = Number(it.quantityOrdered);
    const cost = Number(it.unitCost);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new AppError(`Item #${idx + 1}: quantity must be a positive whole number`, 400);
    }
    if (!Number.isFinite(cost) || cost < 0) {
      throw new AppError(`Item #${idx + 1}: unit cost must be zero or a positive number`, 400);
    }
    return { medicineId: key, qty, cost };
  });

  let expected = null;
  if (expectedDelivery) {
    expected = new Date(expectedDelivery);
    if (Number.isNaN(expected.getTime())) {
      throw new AppError('Invalid expected delivery date', 400);
    }
  }

  const supplier = await Supplier.findOne({
    _id: supplierId,
    pharmacyId: req.pharmacyId,
    isArchived: { $ne: true },
  });

  if (!supplier) {
    throw new AppError('Supplier not found in your pharmacy records', 404);
  }

  const medicines = await Medicine.find({
    _id: { $in: lines.map((l) => l.medicineId) },
    pharmacyId: req.pharmacyId,
    isArchived: { $ne: true },
  });
  const medById = new Map(medicines.map((m) => [String(m._id), m]));

  if (medById.size !== lines.length) {
    throw new AppError('One or more medicines not found in catalog', 404);
  }

  let totalAmount = 0;
  const poItems = lines.map((l) => {
    const med = medById.get(l.medicineId);
    const subtotal = Number((l.qty * l.cost).toFixed(2));
    totalAmount += subtotal;
    return {
      medicineId: med._id,
      name: med.name,
      quantityOrdered: l.qty,
      unitCost: l.cost,
      subtotal,
    };
  });

  let order;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const seq = await nextSequence(req.pharmacyId, 'po', { session });
      const [created] = await PurchaseOrder.create(
        [
          {
            pharmacyId: req.pharmacyId,
            pharmacistId: req.user._id,
            supplierId: supplier._id,
            poNumber: formatSequence('PO', seq),
            items: poItems,
            totalAmount: Number(totalAmount.toFixed(2)),
            status: 'ordered',
            expectedDelivery: expected,
            notes: typeof notes === 'string' ? notes : '',
          },
        ],
        { session }
      );
      order = created;
    });
  } finally {
    await session.endSession();
  }

  await order.populate('supplierId', 'name contactPerson phone');

  return res.status(201).json({
    success: true,
    message: 'Purchase order created successfully',
    order,
  });
};

// @desc    Receive purchase order and automatically create stock batches (Stock-In)
// @route   PATCH /api/procurement/orders/:id/receive
// @access  Private (Pharmacist only)
const receivePurchaseOrder = async (req, res) => {
  const { batchDetails } = req.body || {}; // array of { medicineId, batchNo, expiryDate }

  const order = await PurchaseOrder.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!order) {
    throw new AppError('Purchase order not found', 404);
  }

  if (order.status !== 'ordered') {
    throw new AppError(`Order cannot be received because it is already ${order.status}`, 400);
  }

  if (!batchDetails || !Array.isArray(batchDetails)) {
    throw new AppError(
      'Please provide batch number and expiration date for each received item',
      400
    );
  }

  // 1. Validate ALL batch details before writing anything
  const now = new Date();
  const batchByMedicine = new Map();
  for (const item of order.items) {
    const batchInfo = batchDetails.find(
      (b) => b && b.medicineId && String(b.medicineId) === String(item.medicineId)
    );

    const batchNo = batchInfo && typeof batchInfo.batchNo === 'string' ? batchInfo.batchNo.trim() : '';
    if (!batchInfo || !batchNo || !batchInfo.expiryDate) {
      throw new AppError(`Missing batch number or expiry date for "${item.name}"`, 400);
    }

    const expiryDate = new Date(batchInfo.expiryDate);
    if (Number.isNaN(expiryDate.getTime())) {
      throw new AppError(`Invalid expiry date for "${item.name}"`, 400);
    }
    if (expiryDate <= now) {
      throw new AppError(`Expiry date for "${item.name}" must be in the future`, 400);
    }

    batchByMedicine.set(String(item.medicineId), { batchNo, expiryDate });
  }

  // 2. Claim the order and stock it in atomically
  let receivedOrder;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      receivedOrder = await PurchaseOrder.findOneAndUpdate(
        { _id: order._id, pharmacyId: req.pharmacyId, status: 'ordered' },
        { status: 'received', receivedDate: new Date() },
        { new: true, session }
      );

      if (!receivedOrder) {
        throw new AppError('Order cannot be received because it is no longer pending', 400);
      }

      for (const item of receivedOrder.items) {
        const { batchNo, expiryDate } = batchByMedicine.get(String(item.medicineId));

        let batch = await StockBatch.findOne({
          pharmacyId: req.pharmacyId,
          medicineId: item.medicineId,
          batchNo,
        }).session(session);

        if (batch) {
          if (!sameDay(batch.expiryDate, expiryDate)) {
            throw new AppError(
              `Batch "${batchNo}" for "${item.name}" already exists with a different expiry date (${new Date(batch.expiryDate).toISOString().slice(0, 10)})`,
              409
            );
          }
          batch.quantity += item.quantityOrdered;
          batch.initialQuantity += item.quantityOrdered;
          batch.purchasePrice = item.unitCost;
          if (batch.quantity > 0) batch.status = 'active';
          await batch.save({ session });
        } else {
          [batch] = await StockBatch.create(
            [
              {
                pharmacyId: req.pharmacyId,
                medicineId: item.medicineId,
                batchNo,
                quantity: item.quantityOrdered,
                initialQuantity: item.quantityOrdered,
                expiryDate,
                purchasePrice: item.unitCost,
                status: 'active',
              },
            ],
            { session }
          );
        }

        await recordMovement(
          {
            pharmacyId: req.pharmacyId,
            batchId: batch._id,
            medicineId: item.medicineId,
            type: 'purchase_receive',
            quantityChange: item.quantityOrdered,
            balanceAfter: batch.quantity,
            reason: `Received purchase order ${receivedOrder.poNumber}`,
            userId: req.user && req.user._id,
            refId: receivedOrder._id,
            refModel: 'PurchaseOrder',
          },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }

  return res.status(200).json({
    success: true,
    message: 'Purchase order received and inventory stock batches updated successfully',
    order: receivedOrder,
  });
};

// @desc    Cancel purchase order
// @route   PATCH /api/procurement/orders/:id/cancel
// @access  Private (Pharmacist only)
const cancelPurchaseOrder = async (req, res) => {
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

  // Atomic status transition so a concurrent receive can't be overwritten
  const cancelled = await PurchaseOrder.findOneAndUpdate(
    { _id: order._id, pharmacyId: req.pharmacyId, status: 'ordered' },
    { status: 'cancelled' },
    { new: true }
  );

  if (!cancelled) {
    return res.status(400).json({
      success: false,
      message: `Cannot cancel an order that is already ${order.status === 'ordered' ? 'processed' : order.status}`,
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Purchase order cancelled successfully',
    order: cancelled,
  });
};

module.exports = {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
};
