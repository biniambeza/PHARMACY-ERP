const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { recordMovement } = require('../utils/stockMovement');
const { audit } = require('../utils/audit');
const { recordControlledReceipt } = require('../services/clinical');

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

// Statuses in which deliveries can still be received.
const RECEIVABLE_STATUSES = ['ordered', 'partially_received'];

const round2 = (n) => Number(Number(n).toFixed(2));

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

const parseNonNegativeInt = (value, label) => {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new AppError(`${label} must be a whole number of zero or more`, 400);
  }
  return n;
};

const parseFutureExpiry = (value, name) => {
  if (!value) throw new AppError(`Missing batch number or expiry date for "${name}"`, 400);
  const expiryDate = new Date(value);
  if (Number.isNaN(expiryDate.getTime())) {
    throw new AppError(`Invalid expiry date for "${name}"`, 400);
  }
  if (expiryDate <= new Date()) {
    throw new AppError(`Expiry date for "${name}" must be in the future`, 400);
  }
  return expiryDate;
};

/**
 * Validate the receive payload against the current order state and return normalized lines:
 *   [{ itemIndex, medicineId, name, batchNo, expiryDate, quantity, bonusQuantity, unitCost }]
 *
 * New shape: { lines: [{ medicineId, batchNo, expiryDate, quantity, bonusQuantity?, unitCost? }] }
 *   Several lines (batches) per PO item are allowed; quantity may be less than outstanding.
 * Legacy shape: { batchDetails: [{ medicineId, batchNo, expiryDate }] } receives the full
 *   outstanding quantity of every item, one batch per item.
 */
const normalizeReceiveLines = (order, body) => {
  const itemIndexByMedicine = new Map(order.items.map((it, i) => [String(it.medicineId), i]));
  const outstanding = order.items.map((it) =>
    Math.max(0, it.quantityOrdered - (it.quantityReceived || 0))
  );

  if (Array.isArray(body.lines)) {
    if (body.lines.length === 0) throw new AppError('Please provide at least one received line', 400);

    const receivedNow = order.items.map(() => 0);
    const seenBatch = new Set();
    const lines = body.lines.map((raw, idx) => {
      const label = `Line #${idx + 1}`;
      if (!raw || !isValidId(raw.medicineId)) {
        throw new AppError(`${label} has an invalid or missing medicine`, 400);
      }
      const itemIndex = itemIndexByMedicine.get(String(raw.medicineId));
      if (itemIndex === undefined) {
        throw new AppError(`${label}: medicine is not on this purchase order`, 400);
      }
      const item = order.items[itemIndex];
      const batchNo = typeof raw.batchNo === 'string' ? raw.batchNo.trim() : '';
      if (!batchNo) throw new AppError(`Missing batch number or expiry date for "${item.name}"`, 400);
      const expiryDate = parseFutureExpiry(raw.expiryDate, item.name);

      const batchKey = `${itemIndex}|${batchNo.toLowerCase()}`;
      if (seenBatch.has(batchKey)) {
        throw new AppError(`Batch "${batchNo}" for "${item.name}" appears more than once in this receipt`, 400);
      }
      seenBatch.add(batchKey);

      const quantity = parseNonNegativeInt(raw.quantity, `${label}: received quantity`);
      const bonusQuantity = parseNonNegativeInt(raw.bonusQuantity, `${label}: bonus quantity`);
      if (quantity + bonusQuantity <= 0) {
        throw new AppError(`${label}: enter a received or bonus quantity for "${item.name}"`, 400);
      }

      let unitCost = item.unitCost;
      if (raw.unitCost !== undefined && raw.unitCost !== null && raw.unitCost !== '') {
        unitCost = Number(raw.unitCost);
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new AppError(`${label}: unit cost must be zero or a positive number`, 400);
        }
      }

      receivedNow[itemIndex] += quantity;
      return {
        itemIndex,
        medicineId: item.medicineId,
        name: item.name,
        batchNo,
        expiryDate,
        quantity,
        bonusQuantity,
        unitCost,
      };
    });

    receivedNow.forEach((qty, i) => {
      if (qty > outstanding[i]) {
        const item = order.items[i];
        throw new AppError(
          `Cannot receive ${qty} of "${item.name}": only ${outstanding[i]} of ${item.quantityOrdered} still outstanding. Record extra free units as bonus quantity.`,
          400
        );
      }
    });

    return lines;
  }

  if (Array.isArray(body.batchDetails)) {
    const lines = [];
    order.items.forEach((item, itemIndex) => {
      if (outstanding[itemIndex] <= 0) return;
      const info = body.batchDetails.find(
        (b) => b && b.medicineId && String(b.medicineId) === String(item.medicineId)
      );
      const batchNo = info && typeof info.batchNo === 'string' ? info.batchNo.trim() : '';
      if (!info || !batchNo || !info.expiryDate) {
        throw new AppError(`Missing batch number or expiry date for "${item.name}"`, 400);
      }
      lines.push({
        itemIndex,
        medicineId: item.medicineId,
        name: item.name,
        batchNo,
        expiryDate: parseFutureExpiry(info.expiryDate, item.name),
        quantity: outstanding[itemIndex],
        bonusQuantity: 0,
        unitCost: item.unitCost,
      });
    });
    if (lines.length === 0) throw new AppError('Nothing is outstanding on this order', 400);
    return lines;
  }

  throw new AppError('Please provide batch number and expiration date for each received item', 400);
};

// Calls the Finance payables service when it is available (written by another module).
const loadPayables = () => {
  try {
    return require('../services/payables');
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && String(err.message).includes('services/payables')) {
      return null;
    }
    throw err;
  }
};

// @desc    Receive a delivery against a purchase order (full or partial) and stock it in
// @route   PATCH /api/procurement/orders/:id/receive
// @access  po:receive
// Body: { lines: [...] | batchDetails: [...], supplierInvoiceNo?, supplierInvoiceDate?, notes? }
const receivePurchaseOrder = async (req, res) => {
  const body = req.body || {};
  if (!isValidId(req.params.id)) throw new AppError('Invalid purchase order id', 400);

  const supplierInvoiceNo =
    typeof body.supplierInvoiceNo === 'string' ? body.supplierInvoiceNo.trim().slice(0, 100) : '';
  let supplierInvoiceDate = null;
  if (body.supplierInvoiceDate) {
    supplierInvoiceDate = new Date(body.supplierInvoiceDate);
    if (Number.isNaN(supplierInvoiceDate.getTime())) {
      throw new AppError('Invalid supplier invoice date', 400);
    }
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

  // Pre-check outside the transaction for clear errors (re-checked inside).
  const existing = await PurchaseOrder.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!existing) throw new AppError('Purchase order not found', 404);
  if (!RECEIVABLE_STATUSES.includes(existing.status)) {
    throw new AppError(`Order cannot be received because it is already ${existing.status}`, 400);
  }
  normalizeReceiveLines(existing, body);

  let receivedOrder;
  let receipt;
  let invoiceCreated = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      invoiceCreated = false;
      // Re-read inside the transaction so validation sees the latest received quantities.
      const order = await PurchaseOrder.findOne({ _id: existing._id, pharmacyId: req.pharmacyId }).session(session);
      if (!order || !RECEIVABLE_STATUSES.includes(order.status)) {
        throw new AppError('Order cannot be received because it is no longer pending', 400);
      }
      const lines = normalizeReceiveLines(order, body);

      const inc = { receiveVersion: 1 };
      const receivedPerItem = order.items.map((it) => it.quantityReceived || 0);
      for (const l of lines) {
        inc[`items.${l.itemIndex}.quantityReceived`] = (inc[`items.${l.itemIndex}.quantityReceived`] || 0) + l.quantity;
        inc[`items.${l.itemIndex}.bonusQuantity`] = (inc[`items.${l.itemIndex}.bonusQuantity`] || 0) + l.bonusQuantity;
        receivedPerItem[l.itemIndex] += l.quantity;
      }
      const complete = order.items.every((it, i) => receivedPerItem[i] >= it.quantityOrdered);

      const seq = await nextSequence(req.pharmacyId, 'grn', { session });
      const receiptNo = formatSequence('GRN', seq);
      const now = new Date();

      // Stock in each batch first so receipt lines can reference the batch ids.
      const receiptLines = [];
      for (const l of lines) {
        const addQty = l.quantity + l.bonusQuantity;
        let batch = await StockBatch.findOne({
          pharmacyId: req.pharmacyId,
          medicineId: l.medicineId,
          batchNo: l.batchNo,
        }).session(session);

        if (batch) {
          if (!sameDay(batch.expiryDate, l.expiryDate)) {
            throw new AppError(
              `Batch "${l.batchNo}" for "${l.name}" already exists with a different expiry date (${new Date(batch.expiryDate).toISOString().slice(0, 10)})`,
              409
            );
          }
          batch.quantity += addQty;
          batch.initialQuantity += addQty;
          if (l.quantity > 0) batch.purchasePrice = l.unitCost;
          if (batch.quantity > 0) batch.status = 'active';
          await batch.save({ session });
        } else {
          [batch] = await StockBatch.create(
            [
              {
                pharmacyId: req.pharmacyId,
                medicineId: l.medicineId,
                batchNo: l.batchNo,
                quantity: addQty,
                initialQuantity: addQty,
                expiryDate: l.expiryDate,
                // Bonus-only lots are free stock.
                purchasePrice: l.quantity > 0 ? l.unitCost : 0,
                status: 'active',
              },
            ],
            { session }
          );
        }

        // Controlled-substance register (no-op for non-controlled medicines).
        await recordControlledReceipt(
          {
            pharmacyId: req.pharmacyId,
            medicineId: l.medicineId,
            batchId: batch._id,
            quantity: addQty,
            userId: req.user && req.user._id,
            refId: order._id,
          },
          { session }
        );

        let reason = `Received purchase order ${order.poNumber} (${receiptNo})`;
        if (l.bonusQuantity > 0) {
          reason += `: ${l.quantity} paid @ ${l.unitCost} + ${l.bonusQuantity} bonus @ 0 cost`;
        }
        if (supplierInvoiceNo) reason += `, supplier invoice ${supplierInvoiceNo}`;

        await recordMovement(
          {
            pharmacyId: req.pharmacyId,
            batchId: batch._id,
            medicineId: l.medicineId,
            type: 'purchase_receive',
            quantityChange: addQty,
            balanceAfter: batch.quantity,
            reason,
            userId: req.user && req.user._id,
            refId: order._id,
            refModel: 'PurchaseOrder',
          },
          { session }
        );

        receiptLines.push({
          medicineId: l.medicineId,
          name: l.name,
          batchId: batch._id,
          batchNo: l.batchNo,
          expiryDate: l.expiryDate,
          quantity: l.quantity,
          bonusQuantity: l.bonusQuantity,
          unitCost: l.unitCost,
        });
      }

      receipt = {
        receiptNo,
        date: now,
        receivedBy: req.user && req.user._id,
        supplierInvoiceNo,
        supplierInvoiceDate,
        notes,
        totalCost: round2(receiptLines.reduce((s, l) => s + l.quantity * l.unitCost, 0)),
        lines: receiptLines,
      };

      const set = { status: complete ? 'received' : 'partially_received' };
      if (complete) set.receivedDate = now;

      // Atomic claim: only applies if nobody else received against this order since we read it.
      receivedOrder = await PurchaseOrder.findOneAndUpdate(
        {
          _id: order._id,
          pharmacyId: req.pharmacyId,
          status: { $in: RECEIVABLE_STATUSES },
          receiveVersion: order.receiveVersion ? order.receiveVersion : { $in: [0, null] },
        },
        { $inc: inc, $set: set, $push: { receipts: receipt } },
        { returnDocument: 'after', session }
      );
      if (!receivedOrder) {
        throw new AppError('This order was updated by someone else. Reload it and try again.', 409);
      }
      receipt = receivedOrder.receipts[receivedOrder.receipts.length - 1];

      // Bonus-only receipts have no value to invoice.
      if (supplierInvoiceNo && receipt.totalCost > 0) {
        const payables = loadPayables();
        if (payables && typeof payables.createSupplierInvoiceFromPO === 'function') {
          await payables.createSupplierInvoiceFromPO(
            {
              pharmacyId: req.pharmacyId,
              purchaseOrder: receivedOrder,
              invoiceNo: supplierInvoiceNo,
              invoiceDate: supplierInvoiceDate || now,
              // Invoice only the value of this delivery, not the whole order.
              amount: receipt.totalCost,
              receipt,
              userId: req.user && req.user._id,
            },
            { session }
          );
          invoiceCreated = true;
        }
      }
    });
  } finally {
    await session.endSession();
  }

  await audit(req, {
    action: 'po.receive',
    entity: 'PurchaseOrder',
    entityId: receivedOrder._id,
    after: { status: receivedOrder.status, receipt },
    meta: { receiptNo: receipt.receiptNo, supplierInvoiceNo, invoiceCreated },
  });

  return res.status(200).json({
    success: true,
    message:
      receivedOrder.status === 'received'
        ? 'Purchase order fully received and inventory stock batches updated successfully'
        : 'Delivery received; the order is partially received',
    order: receivedOrder,
    receipt,
    supplierInvoiceCreated: invoiceCreated,
  });
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
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  submitPurchaseOrder,
  closePurchaseOrder,
  // Shared with reorderController
  buildPurchaseOrderItems,
  insertPurchaseOrder,
};
