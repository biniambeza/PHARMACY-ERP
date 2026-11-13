// Sales returns, refunds and voids (#2). Owner: Returns agent.
const mongoose = require('mongoose');
const Return = require('../models/Return');
const Sale = require('../models/Sale');
const StockBatch = require('../models/StockBatch');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { recordMovement } = require('../utils/stockMovement');
const { audit } = require('../utils/audit');

const toMoney = (n) => Number(Number(n || 0).toFixed(2));
const cleanString = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Returns a valid IANA timezone name, falling back to UTC.
const resolveTimeZone = (tz) => {
  if (typeof tz !== 'string' || !tz.trim()) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return 'UTC';
  }
};

const localDay = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

// services/credit.js is written by the Finance agent; tolerate its absence.
const getReverseCredit = () => {
  try {
    const credit = require('../services/credit');
    return credit && typeof credit.reverseCredit === 'function' ? credit.reverseCredit : null;
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && /services[\\/]credit/.test(err.message)) return null;
    throw err;
  }
};

// Amount of the sale that was put on the customer's credit account.
const creditPortion = (sale) => {
  if (!sale.customerId) return 0;
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  if (payments.length > 0) {
    return toMoney(
      payments
        .filter((p) => p.method === 'credit' && p.status !== 'failed' && p.status !== 'refunded')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    );
  }
  return sale.paymentMethod === 'credit' ? toMoney(sale.grandTotal) : 0;
};

// Puts `quantity` back into the batch the sale item came from.
// Returns { restocked, balanceAfter, note }.
const restockBatch = async ({ pharmacyId, batchId, quantity, now, session }) => {
  const batch = await StockBatch.findOne({ _id: batchId, pharmacyId }).session(session);
  if (!batch) return { restocked: false, note: 'batch no longer exists' };
  if (batch.status === 'discarded') return { restocked: false, note: 'batch was discarded' };
  if (batch.expiryDate && batch.expiryDate <= now) return { restocked: false, note: 'batch expired' };

  const updated = await StockBatch.findOneAndUpdate(
    { _id: batch._id, pharmacyId },
    { $inc: { quantity } },
    { returnDocument: 'after', session }
  );
  if (updated.quantity > 0 && updated.status === 'depleted') {
    await StockBatch.updateOne(
      { _id: updated._id, status: 'depleted' },
      { $set: { status: 'active' } },
      { session }
    );
  }
  return { restocked: true, balanceAfter: updated.quantity, note: '' };
};

// Sums already-returned quantities per sale item (excluding nothing; called inside the txn).
const returnedQuantities = async (pharmacyId, saleId, session) => {
  const previous = await Return.find({ pharmacyId, saleId }).session(session);
  const map = new Map();
  let refunded = 0;
  let creditReversed = 0;
  for (const r of previous) {
    refunded += r.refundTotal || 0;
    creditReversed += r.creditReversed || 0;
    for (const it of r.items) {
      const key = String(it.saleItemId);
      map.set(key, (map.get(key) || 0) + it.quantity);
    }
  }
  return { map, refunded: toMoney(refunded), creditReversed: toMoney(creditReversed) };
};

// @desc    Return some or all items of a sale
// @route   POST /api/returns
// @access  sales:return
const createReturn = async (req, res) => {
  const { saleId, items, reason, refundMethod = 'cash' } = req.body || {};

  if (!saleId || !mongoose.isValidObjectId(saleId)) throw new AppError('A valid saleId is required', 400);
  if (!Array.isArray(items) || items.length === 0) throw new AppError('Select at least one item to return', 400);
  const reasonText = cleanString(reason);
  if (!reasonText) throw new AppError('A return reason is required', 400);
  if (!Return.REFUND_METHODS.includes(refundMethod)) throw new AppError('Invalid refund method', 400);

  // Merge duplicate lines for the same sale item + disposition
  const requested = new Map();
  for (const it of items) {
    const qty = Number(it?.quantity);
    const disposition = it?.disposition || 'restock';
    if (!it?.saleItemId || !mongoose.isValidObjectId(it.saleItemId) || !Number.isInteger(qty) || qty <= 0) {
      throw new AppError('Invalid return item data', 400);
    }
    if (!Return.DISPOSITIONS.includes(disposition)) throw new AppError('Invalid item disposition', 400);
    const key = `${it.saleItemId}|${disposition}`;
    const prev = requested.get(key);
    requested.set(key, { saleItemId: String(it.saleItemId), disposition, quantity: (prev?.quantity || 0) + qty });
  }

  const session = await mongoose.startSession();
  try {
    let created;
    let saleAfter;
    let creditNote = null;

    await session.withTransaction(async () => {
      const now = new Date();
      creditNote = null;

      // Touch the sale first so concurrent returns on the same sale conflict and retry.
      const sale = await Sale.findOneAndUpdate(
        { _id: saleId, pharmacyId: req.pharmacyId },
        { $set: { updatedAt: now } },
        { returnDocument: 'after', session, timestamps: false }
      );
      if (!sale) throw new AppError('Sale not found', 404);
      if (sale.voided) throw new AppError('This sale has been voided and cannot be returned', 400);
      if (sale.returnStatus === 'full') throw new AppError('This sale has already been fully returned', 400);

      const { map: alreadyReturned, refunded, creditReversed: prevCreditReversed } =
        await returnedQuantities(req.pharmacyId, sale._id, session);
      const saleItems = new Map(sale.items.map((i) => [String(i._id), i]));

      // Validate quantities per sale item (across dispositions)
      const perItem = new Map();
      for (const r of requested.values()) {
        if (!saleItems.has(r.saleItemId)) throw new AppError('Item does not belong to this sale', 400);
        perItem.set(r.saleItemId, (perItem.get(r.saleItemId) || 0) + r.quantity);
      }
      for (const [saleItemId, qty] of perItem) {
        const si = saleItems.get(saleItemId);
        const remaining = si.quantity - (alreadyReturned.get(saleItemId) || 0);
        if (qty > remaining) {
          throw new AppError(
            `Cannot return ${qty} of "${si.name}" (batch ${si.batchNo}): only ${remaining} left to return`,
            400
          );
        }
      }

      // Refunds are proportional to what was actually paid (discount/tax included).
      const factor = sale.subtotal > 0 ? sale.grandTotal / sale.subtotal : 0;
      // Insurance sales: the insurer's share of returned items is never refunded to
      // the patient; it comes off the insurance claim instead (services/insurance).
      const insurerShareOf = (si, qty) =>
        sale.insurance && si.quantity ? ((Number(si.insuranceAmount) || 0) * qty) / si.quantity : 0;
      const returnItems = [];
      const movements = [];
      for (const r of requested.values()) {
        const si = saleItems.get(r.saleItemId);
        let restocked = false;
        let note = '';
        if (r.disposition === 'restock') {
          const result = await restockBatch({
            pharmacyId: req.pharmacyId,
            batchId: si.batchId,
            quantity: r.quantity,
            now,
            session,
          });
          restocked = result.restocked;
          note = result.restocked ? '' : `not restocked: ${result.note}`;
          if (result.restocked) {
            movements.push({
              pharmacyId: req.pharmacyId,
              batchId: si.batchId,
              medicineId: si.medicineId,
              type: 'return',
              quantityChange: r.quantity,
              balanceAfter: result.balanceAfter,
              reason: reasonText,
              userId: req.user._id,
            });
          }
        } else {
          note = 'discarded';
        }
        returnItems.push({
          saleItemId: si._id,
          medicineId: si.medicineId,
          name: si.name,
          batchId: si.batchId,
          batchNo: si.batchNo,
          quantity: r.quantity,
          unitPrice: si.unitPrice,
          refundAmount: toMoney(Math.max(0, r.quantity * si.unitPrice * factor - insurerShareOf(si, r.quantity))),
          disposition: r.disposition,
          restocked,
          note,
        });
      }

      // Return status after this return
      const isFull = sale.items.every((si) => {
        const key = String(si._id);
        return (alreadyReturned.get(key) || 0) + (perItem.get(key) || 0) >= si.quantity;
      });

      // What the patient actually paid (grand total minus the insurer's share)
      const insurerTotal = sale.insurance
        ? sale.items.reduce((s, si) => s + (Number(si.insuranceAmount) || 0), 0)
        : 0;
      const patientPaid = toMoney(Math.max(0, sale.grandTotal - insurerTotal));
      const remainingRefundable = toMoney(Math.max(0, patientPaid - refunded));
      let refundTotal = toMoney(returnItems.reduce((s, i) => s + i.refundAmount, 0));
      // On the final return, refund exactly what is left (absorbs rounding)
      if (isFull || refundTotal > remainingRefundable) refundTotal = remainingRefundable;

      const returnId = new mongoose.Types.ObjectId();

      // Credit sales: take the refund off the customer's balance first. The credit
      // service caps the reversal at what is still owed and updates the sale's
      // balanceDue/paymentStatus itself; the rest is refunded via refundMethod.
      let creditReversed = 0;
      const creditLeft = toMoney(Math.max(0, creditPortion(sale) - prevCreditReversed));
      if (sale.customerId && creditLeft > 0 && refundTotal > 0) {
        const reverseCredit = getReverseCredit();
        if (typeof reverseCredit === 'function') {
          const result = await reverseCredit(
            {
              pharmacyId: req.pharmacyId,
              customerId: sale.customerId,
              amount: toMoney(Math.min(refundTotal, creditLeft)),
              refId: returnId,
              saleId: sale._id,
            },
            { session }
          );
          creditReversed = toMoney(Math.min(refundTotal, Number(result?.reversed) || 0));
        } else {
          creditNote = 'credit service unavailable';
        }
      }

      const seq = await nextSequence(req.pharmacyId, 'return', { session });
      const returnNumber = formatSequence('RET', seq, now);

      [created] = await Return.create(
        [
          {
            _id: returnId,
            pharmacyId: req.pharmacyId,
            saleId: sale._id,
            invoiceNumber: sale.invoiceNumber,
            returnNumber,
            customer: { name: sale.customer?.name || '', phone: sale.customer?.phone || '' },
            customerId: sale.customerId || null,
            items: returnItems,
            reason: reasonText,
            refundMethod,
            refundTotal,
            creditReversed,
            refundDue: toMoney(Math.max(0, refundTotal - creditReversed)),
            processedBy: req.user._id,
          },
        ],
        { session }
      );

      for (const m of movements) {
        await recordMovement({ ...m, refId: created._id, refModel: 'Return' }, { session });
      }

      saleAfter = await Sale.findOneAndUpdate(
        { _id: sale._id, pharmacyId: req.pharmacyId },
        { $set: { returnStatus: isFull ? 'full' : 'partial' } },
        { returnDocument: 'after', session }
      );

      await audit(
        req,
        {
          action: 'sale.return',
          entity: 'Return',
          entityId: created._id,
          before: { returnStatus: sale.returnStatus },
          after: created,
          meta: { saleId: sale._id, invoiceNumber: sale.invoiceNumber, refundTotal, creditReversed },
        },
        { session }
      );
    });

    return res.status(201).json({
      success: true,
      message: `Return ${created.returnNumber} recorded`,
      return: created,
      sale: saleAfter,
      ...(creditNote === 'credit service unavailable' ? { warning: 'Customer credit balance was not adjusted' } : {}),
    });
  } finally {
    await session.endSession();
  }
};

// @desc    Void a sale made today (restocks everything)
// @route   POST /api/returns/void/:saleId
// @access  sales:void
const voidSale = async (req, res) => {
  const { saleId } = req.params;
  if (!mongoose.isValidObjectId(saleId)) throw new AppError('Invalid sale id', 400);
  const reasonText = cleanString(req.body?.reason);
  if (!reasonText) throw new AppError('A void reason is required', 400);
  const timeZone = resolveTimeZone(req.headers['x-timezone']);

  const session = await mongoose.startSession();
  try {
    let saleAfter;
    let creditWarning = false;
    let creditReversed = 0;

    await session.withTransaction(async () => {
      const now = new Date();
      creditWarning = false;
      const sale = await Sale.findOneAndUpdate(
        { _id: saleId, pharmacyId: req.pharmacyId },
        { $set: { updatedAt: now } },
        { returnDocument: 'after', session, timestamps: false }
      );
      if (!sale) throw new AppError('Sale not found', 404);
      if (sale.voided) throw new AppError('This sale is already voided', 400);
      if (sale.returnStatus && sale.returnStatus !== 'none') {
        throw new AppError('A sale with returns cannot be voided', 400);
      }
      if (localDay(sale.createdAt, timeZone) !== localDay(now, timeZone)) {
        throw new AppError('Only sales made today can be voided; use a return instead', 400);
      }
      // A sale of a closed shift (drawer already counted) can only be returned, not voided
      if (sale.shiftId) {
        const Shift = require('../models/Shift');
        const shift = await Shift.findOne({ _id: sale.shiftId, pharmacyId: req.pharmacyId })
          .select('status')
          .session(session);
        if (shift && shift.status === 'closed') {
          throw new AppError('Shift already closed', 400);
        }
      }

      for (const si of sale.items) {
        const updated = await StockBatch.findOneAndUpdate(
          { _id: si.batchId, pharmacyId: req.pharmacyId },
          { $inc: { quantity: si.quantity } },
          { returnDocument: 'after', session }
        );
        if (!updated) continue; // batch deleted: nothing to put back
        if (updated.quantity > 0 && updated.status === 'depleted' && updated.expiryDate > now) {
          await StockBatch.updateOne(
            { _id: updated._id, status: 'depleted' },
            { $set: { status: 'active' } },
            { session }
          );
        }
        await recordMovement(
          {
            pharmacyId: req.pharmacyId,
            batchId: si.batchId,
            medicineId: si.medicineId,
            type: 'void',
            quantityChange: si.quantity,
            balanceAfter: updated.quantity,
            reason: reasonText,
            userId: req.user._id,
            refId: sale._id,
            refModel: 'Sale',
          },
          { session }
        );
      }

      const credit = creditPortion(sale);
      creditReversed = 0;
      if (sale.customerId && credit > 0) {
        const reverseCredit = getReverseCredit();
        if (typeof reverseCredit === 'function') {
          // Updates the sale's balanceDue/paymentStatus itself; returns what was actually reversed.
          const result = await reverseCredit(
            { pharmacyId: req.pharmacyId, customerId: sale.customerId, amount: credit, refId: sale._id, saleId: sale._id },
            { session }
          );
          creditReversed = toMoney(Number(result?.reversed) || 0);
        } else {
          creditWarning = true;
        }
      }

      saleAfter = await Sale.findOneAndUpdate(
        { _id: sale._id, pharmacyId: req.pharmacyId },
        { $set: { voided: true, voidReason: reasonText, voidedBy: req.user._id, voidedAt: now } },
        { returnDocument: 'after', session }
      );

      await audit(
        req,
        {
          action: 'sale.void',
          entity: 'Sale',
          entityId: sale._id,
          before: { voided: false },
          after: { voided: true, voidReason: reasonText, voidedAt: now },
          meta: { invoiceNumber: sale.invoiceNumber, grandTotal: sale.grandTotal, creditReversed },
        },
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      message: `Sale ${saleAfter.invoiceNumber} voided`,
      sale: saleAfter,
      creditReversed,
      // Voided insurance sales drop out of claims, so only the patient's share is refunded.
      refundDue: toMoney(
        Math.max(
          0,
          saleAfter.grandTotal -
            (saleAfter.insurance ? (saleAfter.items || []).reduce((s, si) => s + (Number(si.insuranceAmount) || 0), 0) : 0) -
            creditReversed
        )
      ),
      ...(creditWarning ? { warning: 'Customer credit balance was not adjusted' } : {}),
    });
  } finally {
    await session.endSession();
  }
};

// @desc    List returns (paginated, search by return # or invoice #)
// @route   GET /api/returns
// @access  sales:view
const getReturns = async (req, res) => {
  const { search, saleId, limit = 25, page = 1 } = req.query;
  const query = { pharmacyId: req.pharmacyId };
  if (typeof search === 'string' && search.trim()) {
    const rx = { $regex: escapeRegex(search.trim().slice(0, 100)), $options: 'i' };
    query.$or = [{ returnNumber: rx }, { invoiceNumber: rx }, { 'customer.name': rx }];
  }
  if (saleId) {
    if (!mongoose.isValidObjectId(saleId)) throw new AppError('Invalid sale id', 400);
    query.saleId = saleId;
  }
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

  const [total, returns] = await Promise.all([
    Return.countDocuments(query),
    Return.find(query)
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
  ]);

  return res.status(200).json({ success: true, total, page: pageNum, limit: limitNum, returns });
};

// @desc    Get one return
// @route   GET /api/returns/:id
// @access  sales:view
const getReturnById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Return not found', 404);
  const ret = await Return.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId })
    .populate('processedBy', 'name')
    .populate('saleId', 'invoiceNumber createdAt grandTotal paymentMethod customer');
  if (!ret) throw new AppError('Return not found', 404);
  return res.status(200).json({ success: true, return: ret });
};

module.exports = { createReturn, voidSale, getReturns, getReturnById };
