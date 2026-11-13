const mongoose = require('mongoose');
const PurchaseOrder = require('../../models/PurchaseOrder');
const StockBatch = require('../../models/StockBatch');
const AppError = require('../../utils/AppError');
const { nextSequence, formatSequence } = require('../../utils/sequence');
const { recordMovement } = require('../../utils/stockMovement');
const { audit } = require('../../utils/audit');
const { recordControlledReceipt } = require('../../services/clinical');
const { isValidId, sameDay, RECEIVABLE_STATUSES, round2 } = require('./helpers');

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
    return require('../../services/payables');
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

module.exports = {
  receivePurchaseOrder,
};
