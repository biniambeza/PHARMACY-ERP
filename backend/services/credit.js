// Customer credit (#6). Owner: Finance agent.
//
// Contract (docs/AGENT_PLAN.md):
//   assertCreditAllowed({ pharmacyId, customerId, amount }, { session })
//   applyCreditSale({ pharmacyId, customerId, saleId, amount }, { session })
//   reverseCredit({ pharmacyId, customerId, amount, refId, saleId? }, { session })
//
// Credit limit semantics: creditLimit 0 = no credit allowed, null = unlimited.
// Balance changes are single atomic updates whose filter re-checks the
// limit/balance, so concurrent sales cannot push a customer over the limit.
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const Customer = require('../models/Customer');
const CustomerLedger = require('../models/CustomerLedger');
const Sale = require('../models/Sale');

const EPS = 0.005;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const toId = (v, label) => {
  const raw = v && v._id ? v._id : v;
  if (!raw || !mongoose.isValidObjectId(raw)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(String(raw));
};

const toAmount = (amount) => {
  const n = round2(amount);
  if (!Number.isFinite(Number(amount)) || n <= 0) {
    throw new AppError('Credit amount must be a positive number', 400);
  }
  return n;
};

const sessionOpt = (session) => (session ? { session } : {});

// Throws AppError unless `customerId` exists in this pharmacy, is active and can
// take `amount` more credit. Returns the customer document.
const assertCreditAllowed = async ({ pharmacyId, customerId, amount }, { session } = {}) => {
  const pid = toId(pharmacyId, 'pharmacy id');
  const cid = toId(customerId, 'customer id');
  const amt = toAmount(amount);

  const query = Customer.findOne({ _id: cid, pharmacyId: pid });
  if (session) query.session(session);
  const customer = await query;

  if (!customer) throw new AppError('Customer not found', 404);
  if (!customer.active) throw new AppError('Customer account is inactive', 400);

  const limit = customer.creditLimit;
  if (limit !== null && limit !== undefined) {
    if (limit <= 0) throw new AppError(`Credit is not allowed for ${customer.name}`, 400);
    const balance = round2(customer.balance);
    if (balance + amt > limit + EPS) {
      const available = round2(Math.max(0, limit - balance));
      throw new AppError(
        `Credit limit exceeded for ${customer.name}: available credit is ${available.toFixed(2)}, requested ${amt.toFixed(2)}`,
        400
      );
    }
  }
  return customer;
};

// Puts `amount` of a sale on the customer's account (balance += amount).
// The credit limit is re-checked atomically. Returns the updated customer.
const applyCreditSale = async ({ pharmacyId, customerId, saleId, amount }, { session } = {}) => {
  const pid = toId(pharmacyId, 'pharmacy id');
  const cid = toId(customerId, 'customer id');
  const amt = toAmount(amount);
  const sid = saleId ? toId(saleId, 'sale id') : null;

  const customer = await Customer.findOneAndUpdate(
    {
      _id: cid,
      pharmacyId: pid,
      active: true,
      $or: [
        { creditLimit: null },
        { $expr: { $lte: [{ $add: ['$balance', amt] }, { $add: ['$creditLimit', EPS] }] } },
      ],
    },
    { $inc: { balance: amt } },
    { returnDocument: 'after', ...sessionOpt(session) }
  );

  if (!customer) {
    // Explain why (missing / inactive / over limit)
    await assertCreditAllowed({ pharmacyId: pid, customerId: cid, amount: amt }, { session });
    throw new AppError('Credit could not be applied', 409);
  }

  await CustomerLedger.create(
    [
      {
        pharmacyId: pid,
        customerId: cid,
        type: 'sale',
        amount: amt,
        balanceAfter: round2(customer.balance),
        saleId: sid,
        refId: sid,
        refModel: sid ? 'Sale' : '',
      },
    ],
    sessionOpt(session)
  );

  return customer;
};

// Finds the sale a reversal belongs to: an explicit saleId, a Sale id passed as
// refId (voids), or the saleId of a Return document passed as refId (returns).
const resolveSale = async (pid, { saleId, refId }, session) => {
  const candidates = [];
  if (saleId && mongoose.isValidObjectId(saleId)) candidates.push(saleId);
  if (refId && mongoose.isValidObjectId(refId)) {
    candidates.push(refId);
    const Return = mongoose.models.Return;
    if (Return) {
      const q = Return.findOne({ _id: refId, pharmacyId: pid }).select('saleId').lean();
      if (session) q.session(session);
      const ret = await q;
      if (ret && ret.saleId) candidates.push(ret.saleId);
    }
  }
  for (const id of candidates) {
    const q = Sale.findOne({ _id: id, pharmacyId: pid }).select('balanceDue amountPaid grandTotal customerId');
    if (session) q.session(session);
    const sale = await q;
    if (sale) return sale;
  }
  return null;
};

// Takes credit back off the customer's account (returns, voids).
// The reversal is capped at what is still owed: the sale's balanceDue (when the
// sale can be resolved) and the customer's balance. When a sale is resolved its
// balanceDue / paymentStatus are reduced too, so callers must NOT change them.
// Returns { customer, reversed, saleId } - refund anything above `reversed` in cash.
const reverseCredit = async ({ pharmacyId, customerId, amount, refId, saleId }, { session } = {}) => {
  const pid = toId(pharmacyId, 'pharmacy id');
  const cid = toId(customerId, 'customer id');
  const amt = toAmount(amount);
  const ref = refId && mongoose.isValidObjectId(refId) ? new mongoose.Types.ObjectId(String(refId)) : null;

  const sale = await resolveSale(pid, { saleId, refId: ref }, session);
  const saleCustomerMatches = sale && sale.customerId && String(sale.customerId) === String(cid);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const q = Customer.findOne({ _id: cid, pharmacyId: pid });
    if (session) q.session(session);
    const current = await q;
    if (!current) throw new AppError('Customer not found', 404);

    let reversed = Math.min(amt, round2(Math.max(0, current.balance)));
    if (saleCustomerMatches) reversed = Math.min(reversed, round2(sale.balanceDue || 0));
    reversed = round2(reversed);

    if (reversed <= 0) return { customer: current, reversed: 0, saleId: sale ? sale._id : null };

    const customer = await Customer.findOneAndUpdate(
      { _id: cid, pharmacyId: pid, balance: { $gte: reversed - EPS } },
      { $inc: { balance: -reversed } },
      { returnDocument: 'after', ...sessionOpt(session) }
    );
    if (!customer) continue; // balance changed concurrently: recompute

    if (customer.balance < 0 && customer.balance > -EPS) {
      await Customer.updateOne({ _id: cid, balance: customer.balance }, { $set: { balance: 0 } }, sessionOpt(session));
      customer.balance = 0;
    }

    if (saleCustomerMatches) {
      const newDue = round2(Math.max(0, (sale.balanceDue || 0) - reversed));
      await Sale.updateOne(
        { _id: sale._id, pharmacyId: pid },
        { $set: { balanceDue: newDue, ...(newDue <= EPS ? { paymentStatus: 'paid' } : {}) } },
        sessionOpt(session)
      );
    }

    await CustomerLedger.create(
      [
        {
          pharmacyId: pid,
          customerId: cid,
          type: 'reversal',
          amount: -reversed,
          balanceAfter: round2(customer.balance),
          saleId: sale ? sale._id : null,
          refId: ref,
          refModel: ref && sale && String(sale._id) === String(ref) ? 'Sale' : ref ? 'Return' : '',
        },
      ],
      sessionOpt(session)
    );

    return { customer, reversed, saleId: sale ? sale._id : null };
  }
  throw new AppError('Customer balance is changing too quickly, please retry', 409);
};

module.exports = { assertCreditAllowed, applyCreditSale, reverseCredit, round2, EPS };
