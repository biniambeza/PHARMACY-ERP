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
const { salePricesIncludeTax, splitAmount } = require('../services/einvoice/payload');
const { recordClaimAdjustment, ADJUSTABLE_STATUSES } = require('../services/insurance');
const { recordControlledMovement } = require('../services/clinical');
const { pharmacyTimeZone } = require('../utils/timezone');

const EPS = 0.005;
const getCreditService = () => require('../services/credit');

const toMoney = (n) => Number(Number(n || 0).toFixed(2));
const cleanString = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

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

// What was actually paid per sale item (sums to sale.grandTotal):
//   gross    = item subtotal - its share of the sale discount + its tax when prices exclude tax
//   tax      = item taxAmount (legacy sales with a typed-in sale tax: spread by subtotal)
//   discount = share of the sale-level discount
//   insurer  = items[].insuranceAmount (insurance sales)
// Returns Map saleItemId -> { gross, tax, discount, insurer }.
const saleLineAmounts = (sale) => {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const subtotals = items.map((i) => Number(i.subtotal) || 0);
  const discounts = splitAmount(Number(sale.discount) || 0, subtotals);
  let taxes = items.map((i) => toMoney(i.taxAmount));
  const saleTax = toMoney(sale.tax);
  if (Math.abs(taxes.reduce((s, t) => s + t, 0) - saleTax) > 0.011) taxes = splitAmount(saleTax, subtotals);
  const inclusive = salePricesIncludeTax(sale);
  let gross = items.map((i, idx) => toMoney(subtotals[idx] - discounts[idx] + (inclusive ? 0 : taxes[idx])));
  // Anything that does not add up to the grand total (legacy data) is spread by line value
  const diff = toMoney((Number(sale.grandTotal) || 0) - gross.reduce((s, g) => s + g, 0));
  if (Math.abs(diff) > 0.011) {
    const extra = splitAmount(Math.abs(diff), gross.map((g) => Math.max(0, g)));
    gross = gross.map((g, idx) => toMoney(Math.max(0, g + Math.sign(diff) * extra[idx])));
  }
  const map = new Map();
  items.forEach((i, idx) => {
    map.set(String(i._id), {
      gross: gross[idx],
      tax: Math.min(taxes[idx], gross[idx]),
      discount: discounts[idx],
      insurer: sale.insurance ? Math.min(toMoney(i.insuranceAmount), gross[idx]) : 0,
    });
  });
  return map;
};

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

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

// Sums what previous returns of the sale already took back, per sale item (called inside the txn):
// quantity and the gross / tax / discount / insurer amounts. Older returns without stored
// per-item amounts are estimated the way they were refunded (proportionally).
const returnedQuantities = async (pharmacyId, sale, lineAmounts, session) => {
  const previous = await Return.find({ pharmacyId, saleId: sale._id }).session(session);
  const saleItems = new Map((sale.items || []).map((i) => [String(i._id), i]));
  const legacyFactor = sale.subtotal > 0 ? sale.grandTotal / sale.subtotal : 0;
  const map = new Map();
  const amounts = new Map();
  let refunded = 0;
  let creditReversed = 0;
  for (const r of previous) {
    refunded += r.refundTotal || 0;
    creditReversed += r.creditReversed || 0;
    for (const it of r.items) {
      const key = String(it.saleItemId);
      map.set(key, (map.get(key) || 0) + it.quantity);
      const si = saleItems.get(key);
      const line = lineAmounts.get(key);
      const frac = si && si.quantity ? Math.min(1, it.quantity / si.quantity) : 0;
      const prev = amounts.get(key) || { gross: 0, tax: 0, discount: 0, insurer: 0 };
      const insurer = isNum(it.insurerAmount) ? Number(it.insurerAmount) : line ? line.insurer * frac : 0;
      prev.insurer += insurer;
      prev.gross += isNum(it.grossAmount)
        ? Number(it.grossAmount)
        : Math.max((it.refundAmount || 0) + insurer, si ? it.quantity * si.unitPrice * legacyFactor : 0);
      prev.tax += isNum(it.taxAmount) ? Number(it.taxAmount) : line ? line.tax * frac : 0;
      prev.discount += isNum(it.discountAmount) ? Number(it.discountAmount) : line ? line.discount * frac : 0;
      amounts.set(key, prev);
    }
  }
  return { map, amounts, refunded: toMoney(refunded), creditReversed: toMoney(creditReversed) };
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
    let claimAfter = null;

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
      if (refundMethod === 'store_credit' && !sale.customerId) {
        throw new AppError('Store credit needs a customer account on the sale; choose another refund method', 400);
      }
      claimAfter = null;

      const lineAmounts = saleLineAmounts(sale);
      const {
        map: alreadyReturned,
        amounts: alreadyAmounts,
        refunded,
        creditReversed: prevCreditReversed,
      } = await returnedQuantities(req.pharmacyId, sale, lineAmounts, session);
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

      // Refunds follow what each line actually paid (its discount share, its own tax), capped
      // per line at what is left of it; the last units of a line take exactly the remainder.
      // Insurance sales: the insurer's share of returned items is never refunded to the
      // patient; it comes off the insurance claim instead (services/insurance).
      const ZERO = { gross: 0, tax: 0, discount: 0, insurer: 0 };
      const running = new Map();
      const takeLine = (si, qty) => {
        const key = String(si._id);
        const line = lineAmounts.get(key) || ZERO;
        const run = running.get(key) || { qty: alreadyReturned.get(key) || 0, ...(alreadyAmounts.get(key) || ZERO) };
        const last = run.qty + qty >= si.quantity;
        const part = (field) => {
          const left = toMoney(Math.max(0, line[field] - run[field]));
          return last ? left : Math.min(left, toMoney((line[field] * qty) / si.quantity));
        };
        const out = { gross: part('gross'), tax: part('tax'), discount: part('discount'), insurer: part('insurer') };
        out.tax = Math.min(out.tax, out.gross);
        out.insurer = Math.min(out.insurer, out.gross);
        running.set(key, {
          qty: run.qty + qty,
          gross: run.gross + out.gross,
          tax: run.tax + out.tax,
          discount: run.discount + out.discount,
          insurer: run.insurer + out.insurer,
        });
        return out;
      };
      const returnId = new mongoose.Types.ObjectId();
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
            // Controlled register: stock back in (no-op for other medicines). Recorded right
            // after the restock so balanceAfter is the stock at that point.
            await recordControlledMovement(
              {
                pharmacyId: req.pharmacyId,
                medicineId: si.medicineId,
                batchId: si.batchId,
                entryType: 'return',
                quantityIn: r.quantity,
                userId: req.user._id,
                refId: returnId,
                saleId: sale._id,
                patientId: sale.patientId || null,
                prescriptionId: sale.prescriptionId || null,
                notes: `Return of ${sale.invoiceNumber}: ${reasonText}`.slice(0, 500),
                date: now,
              },
              { session }
            );
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
        const amt = takeLine(si, r.quantity);
        returnItems.push({
          saleItemId: si._id,
          medicineId: si.medicineId,
          name: si.name,
          batchId: si.batchId,
          batchNo: si.batchNo,
          quantity: r.quantity,
          unitPrice: si.unitPrice,
          refundAmount: toMoney(Math.max(0, amt.gross - amt.insurer)),
          grossAmount: amt.gross,
          discountAmount: amt.discount,
          taxAmount: amt.tax,
          netAmount: toMoney(Math.max(0, amt.gross - amt.tax)),
          insurerAmount: amt.insurer,
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
      // Safety net for sales with older returns (estimated amounts): never refund more than
      // the patient has left; the excess comes off the last lines.
      if (refundTotal > remainingRefundable + EPS) {
        let excess = toMoney(refundTotal - remainingRefundable);
        for (let i = returnItems.length - 1; i >= 0 && excess > 0; i -= 1) {
          const cut = Math.min(excess, returnItems[i].refundAmount);
          returnItems[i].refundAmount = toMoney(returnItems[i].refundAmount - cut);
          excess = toMoney(excess - cut);
        }
        refundTotal = remainingRefundable;
      }
      const sumOf = (k) => toMoney(returnItems.reduce((s, i) => s + (i[k] || 0), 0));
      const grossTotal = sumOf('grossAmount');
      const taxTotal = sumOf('taxAmount');
      const netTotal = sumOf('netAmount');
      const insurerTotalReturned = sumOf('insurerAmount');

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

      // Part of the sale paid with store credit: given back as store credit (never paid out),
      // up to what that store credit paid and earlier returns did not give back yet.
      let storeCreditRestored = 0;
      const afterCredit = toMoney(Math.max(0, refundTotal - creditReversed));
      if (sale.customerId && afterCredit > 0) {
        const restored = await getCreditService().restoreStoreCredit(
          {
            pharmacyId: req.pharmacyId,
            customerId: sale.customerId,
            saleId: sale._id,
            amount: afterCredit,
            refId: returnId,
            note: `Store credit returned by return ${returnNumber}`,
          },
          { session }
        );
        storeCreditRestored = toMoney(restored?.restored || 0);
      }

      // Store credit: whatever is not taken off the customer's credit balance is credited
      // to the customer's account instead of being paid out.
      let storeCredited = storeCreditRestored;
      const refundDue = toMoney(Math.max(0, afterCredit - storeCreditRestored));
      if (refundMethod === 'store_credit' && refundDue > 0) {
        const result = await getCreditService().issueStoreCredit(
          {
            pharmacyId: req.pharmacyId,
            customerId: sale.customerId,
            amount: refundDue,
            refId: returnId,
            saleId: sale._id,
            note: `Store credit from return ${returnNumber}`,
          },
          { session }
        );
        storeCredited = toMoney(storeCreditRestored + (result?.credited || 0));
      }

      // Insurer share of a sale on a submitted / paid claim: booked as a claim adjustment
      // (draft and unclaimed sales are netted automatically when the claim is built/submitted).
      let claimAdjustment;
      if (sale.insurance?.claimId && insurerTotalReturned > 0) {
        claimAfter = await recordClaimAdjustment(
          {
            pharmacyId: req.pharmacyId,
            claimId: sale.insurance.claimId,
            saleId: sale._id,
            invoiceNumber: sale.invoiceNumber,
            returnId,
            returnNumber,
            amount: insurerTotalReturned,
            date: now,
          },
          { session }
        );
        if (claimAfter) {
          claimAdjustment = { claimId: claimAfter._id, claimNumber: claimAfter.claimNumber, amount: insurerTotalReturned };
        }
      }

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
            refundDue,
            grossTotal,
            taxTotal,
            netTotal,
            insurerTotal: insurerTotalReturned,
            storeCredited,
            claimAdjustment,
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
          meta: { saleId: sale._id, invoiceNumber: sale.invoiceNumber, refundTotal, creditReversed, storeCreditRestored },
        },
        { session }
      );
    });

    return res.status(201).json({
      success: true,
      message: `Return ${created.returnNumber} recorded`,
      return: created,
      sale: saleAfter,
      ...(claimAfter
        ? {
            claim: {
              _id: claimAfter._id,
              claimNumber: claimAfter.claimNumber,
              status: claimAfter.status,
              adjustedTotal: claimAfter.adjustedTotal,
              outstanding: claimAfter.outstandingAmount,
              refundDueToInsurer: claimAfter.refundDueToInsurer,
            },
          }
        : {}),
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
  // Business day of the pharmacy (configured zone, else JOBS_TZ / Africa/Addis_Ababa); the
  // client's x-timezone header is not trusted here (an extreme zone would stretch "today").
  const timeZone = pharmacyTimeZone(req.pharmacy);

  const session = await mongoose.startSession();
  try {
    let saleAfter;
    let creditWarning = false;
    let creditReversed = 0;
    let storeCreditRestored = 0;

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

      // Insurance sale already billed to the insurer: the claim is frozen, so use a return
      // (its insurer share is booked as a claim adjustment).
      if (sale.insurance?.claimId) {
        const InsuranceClaim = require('../models/InsuranceClaim');
        const claim = await InsuranceClaim.findOne({ _id: sale.insurance.claimId, pharmacyId: req.pharmacyId })
          .select('status claimNumber')
          .session(session);
        if (claim && ADJUSTABLE_STATUSES.includes(claim.status)) {
          throw new AppError(
            `This sale is on insurance claim ${claim.claimNumber} (${claim.status.replace('_', ' ')}) and cannot be voided; use a return instead`,
            400
          );
        }
      }

      // Fiscalised sale: a void cannot take back an invoice the tax authority has (or may
      // have) recorded; that needs a return (credit note). Unsubmitted records are closed as
      // not_required so they are never submitted.
      const FiscalInvoice = require('../models/FiscalInvoice');
      const fiscal = await FiscalInvoice.findOne({ pharmacyId: req.pharmacyId, saleId: sale._id, type: 'invoice' })
        .select('status lockedAt')
        .session(session);
      if (fiscal && fiscal.status !== 'not_required') {
        if (['accepted', 'submitted'].includes(fiscal.status)) {
          throw new AppError(
            `This sale's fiscal invoice was already ${fiscal.status} by the tax authority, so it cannot be voided; use a return (credit note) instead`,
            400
          );
        }
        const closed = await FiscalInvoice.updateOne(
          {
            _id: fiscal._id,
            status: { $in: ['pending', 'failed', 'rejected'] },
            $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(now.getTime() - 2 * 60 * 1000) } }],
          },
          { $set: { status: 'not_required', lastError: 'Sale voided', lockedAt: null } },
          { session }
        );
        if (closed.matchedCount !== 1) {
          throw new AppError('This sale is being submitted for e-invoicing right now; try again in a moment', 409);
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
        // Controlled register: a void puts the dispensed stock back ('return' entry, noted as a void)
        await recordControlledMovement(
          {
            pharmacyId: req.pharmacyId,
            medicineId: si.medicineId,
            batchId: si.batchId,
            entryType: 'return',
            quantityIn: si.quantity,
            userId: req.user._id,
            refId: sale._id,
            saleId: sale._id,
            patientId: sale.patientId || null,
            prescriptionId: sale.prescriptionId || null,
            notes: `Void of ${sale.invoiceNumber}: ${reasonText}`.slice(0, 500),
            date: now,
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
      // The part of the credit line that store credit paid goes back to store credit
      storeCreditRestored = 0;
      if (sale.customerId && credit - creditReversed > EPS) {
        const restored = await getCreditService().restoreStoreCredit(
          {
            pharmacyId: req.pharmacyId,
            customerId: sale.customerId,
            saleId: sale._id,
            amount: toMoney(credit - creditReversed),
            refId: sale._id,
            refModel: 'Sale',
            note: `Store credit returned by void of ${sale.invoiceNumber}`,
          },
          { session }
        );
        storeCreditRestored = toMoney(restored?.restored || 0);
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
          meta: { invoiceNumber: sale.invoiceNumber, grandTotal: sale.grandTotal, creditReversed, storeCreditRestored },
        },
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      message: `Sale ${saleAfter.invoiceNumber} voided`,
      sale: saleAfter,
      creditReversed,
      storeCreditRestored,
      // Voided insurance sales drop out of claims, so only the patient's share is refunded.
      // Store credit given back is not paid out either.
      refundDue: toMoney(
        Math.max(
          0,
          saleAfter.grandTotal -
            (saleAfter.insurance ? (saleAfter.items || []).reduce((s, si) => s + (Number(si.insuranceAmount) || 0), 0) : 0) -
            creditReversed -
            storeCreditRestored
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
