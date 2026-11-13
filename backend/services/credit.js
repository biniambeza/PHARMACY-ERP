// Customer credit (#6). Owner: Finance agent.
//
// Contract (docs/AGENT_PLAN.md):
//   assertCreditAllowed({ pharmacyId, customerId, amount }, { session })
//   applyCreditSale({ pharmacyId, customerId, saleId, amount }, { session })
//   reverseCredit({ pharmacyId, customerId, amount, refId, saleId? }, { session })
//   issueStoreCredit({ pharmacyId, customerId, amount, refId, saleId?, note?, refModel? }, { session })
//   restoreStoreCredit({ pharmacyId, customerId, saleId, amount, refId, note?, refModel? }, { session })
//   storeCreditUsedBySale(pharmacyId, sale, { session })
//
// Store credit used by a sale is tracked on the sale (Sale.storeCreditUsed: every time store
// credit pays down a sale's balanceDue, at the sale or when issued store credit settles open
// sales). Returns / voids of such a sale give that part back as store credit (restoreStoreCredit,
// tracked in Sale.storeCreditRestored) instead of paying it out in cash.
//
// Store credit is a negative balance (the pharmacy owes the customer). Issuing it first
// settles the customer's open credit sales (oldest first, so per-sale balanceDue stays in
// step with the balance); the rest becomes a negative balance that the next credit sales
// use up (applyCreditSale reduces that sale's balanceDue by the store credit used).
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
  // Fully covered by store credit (negative balance): allowed whatever the limit
  if (round2(customer.balance) + amt <= EPS) return customer;
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
        { $expr: { $lte: [{ $add: ['$balance', amt] }, EPS] } },
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

  // Store credit used by this sale: the part of `amt` that only brought a negative balance
  // back towards zero is already paid, so it comes off the sale's balanceDue.
  const before = round2(customer.balance - amt);
  const used = round2(Math.min(amt, Math.max(0, -before)));
  if (sid && used > 0) {
    await settleSaleDue(pid, sid, used, session);
  }

  return customer;
};

// Lowers a sale's balanceDue by `amount` (capped at what is due) and updates paymentStatus.
const settleSaleDue = async (pid, sid, amount, session) => {
  const q = Sale.findOne({ _id: sid, pharmacyId: pid }).select('balanceDue amountPaid');
  if (session) q.session(session);
  const sale = await q;
  if (!sale) return 0;
  const take = round2(Math.min(amount, Math.max(0, sale.balanceDue || 0)));
  if (take <= 0) return 0;
  const newDue = round2(Math.max(0, (sale.balanceDue || 0) - take));
  // Only store credit pays a sale down through here (applyCreditSale / issueStoreCredit)
  await Sale.updateOne(
    { _id: sale._id, pharmacyId: pid },
    { $set: { balanceDue: newDue, paymentStatus: newDue <= EPS ? 'paid' : 'partial' }, $inc: { storeCreditUsed: take } },
    sessionOpt(session)
  );
  return take;
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

// Credits `amount` to the customer's account (returns refunded as 'store_credit').
// Open credit sales are settled first (oldest first); the rest leaves a negative balance.
// Returns { customer, credited, settled: [{ saleId, amount }] }.
const issueStoreCredit = async ({ pharmacyId, customerId, amount, refId, saleId, note, refModel = 'Return' }, { session } = {}) => {
  const pid = toId(pharmacyId, 'pharmacy id');
  const cid = toId(customerId, 'customer id');
  const amt = toAmount(amount);
  const ref = refId && mongoose.isValidObjectId(refId) ? new mongoose.Types.ObjectId(String(refId)) : null;
  const sid = saleId && mongoose.isValidObjectId(saleId) ? new mongoose.Types.ObjectId(String(saleId)) : null;

  const q = Customer.findOne({ _id: cid, pharmacyId: pid });
  if (session) q.session(session);
  const current = await q;
  if (!current) throw new AppError('Customer not found', 404);

  // Settle what the customer still owes on credit sales, oldest first
  const settled = [];
  let toSettle = round2(Math.min(amt, Math.max(0, current.balance)));
  if (toSettle > 0) {
    const sq = Sale.find({ pharmacyId: pid, customerId: cid, voided: { $ne: true }, balanceDue: { $gt: EPS } })
      .select('_id balanceDue')
      .sort({ createdAt: 1, _id: 1 });
    if (session) sq.session(session);
    const open = await sq;
    for (const sale of open) {
      if (toSettle <= 0) break;
      // eslint-disable-next-line no-await-in-loop
      const take = await settleSaleDue(pid, sale._id, toSettle, session);
      if (take > 0) {
        settled.push({ saleId: sale._id, amount: take });
        toSettle = round2(toSettle - take);
      }
    }
  }

  const customer = await Customer.findOneAndUpdate(
    { _id: cid, pharmacyId: pid },
    { $inc: { balance: -amt } },
    { returnDocument: 'after', ...sessionOpt(session) }
  );
  if (!customer) throw new AppError('Customer not found', 404);

  await CustomerLedger.create(
    [
      {
        pharmacyId: pid,
        customerId: cid,
        type: 'store_credit',
        amount: -amt,
        balanceAfter: round2(customer.balance),
        saleId: sid,
        refId: ref,
        refModel: ref ? refModel : '',
        note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : 'Store credit',
      },
    ],
    sessionOpt(session)
  );

  return { customer, credited: amt, settled };
};

// Store credit that paid part of `sale` (a Sale doc with _id, customerId, storeCreditUsed).
// Older sales without the field: derived from the sale's ledger entry (the part of the credit
// line that only brought a negative balance back towards zero).
const storeCreditUsedBySale = async (pharmacyId, sale, { session } = {}) => {
  if (!sale) return 0;
  if (sale.storeCreditUsed !== undefined && sale.storeCreditUsed !== null) return round2(sale.storeCreditUsed);
  if (!sale.customerId) return 0;
  const q = CustomerLedger.findOne({ pharmacyId: toId(pharmacyId, 'pharmacy id'), saleId: sale._id, type: 'sale' })
    .select('amount balanceAfter')
    .lean();
  if (session) q.session(session);
  const entry = await q;
  if (!entry) return 0;
  const amt = round2(entry.amount);
  const before = round2(entry.balanceAfter - amt);
  return round2(Math.min(amt, Math.max(0, -before)));
};

// Gives back, as store credit, up to `amount` of the store credit that paid `saleId`
// (minus what earlier returns / voids already gave back). Returns { restored, customer }.
const restoreStoreCredit = async (
  { pharmacyId, customerId, saleId, amount, refId, note, refModel = 'Return' },
  { session } = {}
) => {
  const pid = toId(pharmacyId, 'pharmacy id');
  const cid = toId(customerId, 'customer id');
  const sid = toId(saleId, 'sale id');
  const want = round2(amount);
  if (!(want > 0)) return { restored: 0, customer: null };

  const q = Sale.findOne({ _id: sid, pharmacyId: pid }).select('customerId storeCreditUsed storeCreditRestored');
  if (session) q.session(session);
  const sale = await q;
  if (!sale || !sale.customerId || String(sale.customerId) !== String(cid)) return { restored: 0, customer: null };

  const used = await storeCreditUsedBySale(pid, sale, { session });
  const restorable = round2(used - (Number(sale.storeCreditRestored) || 0));
  const give = round2(Math.min(want, restorable));
  if (give <= 0) return { restored: 0, customer: null };

  await Sale.updateOne(
    { _id: sid, pharmacyId: pid },
    {
      $inc: { storeCreditRestored: give },
      // Older sale: store the derived amount first (issueStoreCredit may $inc it below)
      ...(sale.storeCreditUsed === undefined || sale.storeCreditUsed === null ? { $set: { storeCreditUsed: used } } : {}),
    },
    sessionOpt(session)
  );
  const { customer } = await issueStoreCredit(
    { pharmacyId: pid, customerId: cid, amount: give, refId, saleId: sid, note: note || 'Store credit returned', refModel },
    { session }
  );
  return { restored: give, customer };
};

module.exports = {
  assertCreditAllowed,
  applyCreditSale,
  reverseCredit,
  issueStoreCredit,
  restoreStoreCredit,
  storeCreditUsedBySale,
  round2,
  EPS,
};
