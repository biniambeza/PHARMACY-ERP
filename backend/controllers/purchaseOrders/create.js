const mongoose = require('mongoose');
const PurchaseOrder = require('../../models/PurchaseOrder');
const Supplier = require('../../models/Supplier');
const Medicine = require('../../models/Medicine');
const AppError = require('../../utils/AppError');
const { nextSequence, formatSequence } = require('../../utils/sequence');
const { audit } = require('../../utils/audit');
const { isValidId, round2 } = require('./helpers');

/**
 * Validate raw PO lines ({ medicineId, quantityOrdered, unitCost }) and the supplier, and
 * build the embedded item documents. Shared with the reorder controller.
 * Returns { supplier, items, totalAmount }.
 */
const buildPurchaseOrderItems = async (pharmacyId, supplierId, items) => {
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

  const supplier = await Supplier.findOne({
    _id: supplierId,
    pharmacyId,
    isArchived: { $ne: true },
  });

  if (!supplier) {
    throw new AppError('Supplier not found in your pharmacy records', 404);
  }

  const medicines = await Medicine.find({
    _id: { $in: lines.map((l) => l.medicineId) },
    pharmacyId,
    isArchived: { $ne: true },
  });
  const medById = new Map(medicines.map((m) => [String(m._id), m]));

  if (medById.size !== lines.length) {
    throw new AppError('One or more medicines not found in catalog', 404);
  }

  let totalAmount = 0;
  const poItems = lines.map((l) => {
    const med = medById.get(l.medicineId);
    const subtotal = round2(l.qty * l.cost);
    totalAmount += subtotal;
    return {
      medicineId: med._id,
      name: med.name,
      quantityOrdered: l.qty,
      unitCost: l.cost,
      subtotal,
    };
  });

  return { supplier, items: poItems, totalAmount: round2(totalAmount) };
};

/**
 * Insert a purchase order with the next PO number. Must run inside a transaction.
 */
const insertPurchaseOrder = async (
  { pharmacyId, userId, supplierId, items, totalAmount, status = 'ordered', expectedDelivery = null, notes = '' },
  { session }
) => {
  const seq = await nextSequence(pharmacyId, 'po', { session });
  const [created] = await PurchaseOrder.create(
    [
      {
        pharmacyId,
        pharmacistId: userId,
        supplierId,
        poNumber: formatSequence('PO', seq),
        items,
        totalAmount,
        status,
        expectedDelivery,
        notes,
      },
    ],
    { session }
  );
  return created;
};

// @desc    Create new purchase order
// @route   POST /api/procurement/orders
// @access  po:manage
// Body: { supplierId, items: [{ medicineId, quantityOrdered, unitCost }], expectedDelivery?, notes?, status?: 'draft'|'ordered' }
const createPurchaseOrder = async (req, res) => {
  const { supplierId, items, expectedDelivery, notes, status } = req.body || {};

  if (status !== undefined && status !== 'draft' && status !== 'ordered') {
    throw new AppError("Status must be 'draft' or 'ordered'", 400);
  }

  let expected = null;
  if (expectedDelivery) {
    expected = new Date(expectedDelivery);
    if (Number.isNaN(expected.getTime())) {
      throw new AppError('Invalid expected delivery date', 400);
    }
  }

  const built = await buildPurchaseOrderItems(req.pharmacyId, supplierId, items);

  let order;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      order = await insertPurchaseOrder(
        {
          pharmacyId: req.pharmacyId,
          userId: req.user._id,
          supplierId: built.supplier._id,
          items: built.items,
          totalAmount: built.totalAmount,
          status: status || 'ordered',
          expectedDelivery: expected,
          notes: typeof notes === 'string' ? notes : '',
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await audit(req, { action: 'po.create', entity: 'PurchaseOrder', entityId: order._id, after: order });

  await order.populate('supplierId', 'name contactPerson phone');

  return res.status(201).json({
    success: true,
    message: 'Purchase order created successfully',
    order,
  });
};

module.exports = {
  buildPurchaseOrderItems,
  insertPurchaseOrder,
  createPurchaseOrder,
};
