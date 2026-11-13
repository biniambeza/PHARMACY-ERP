// Credit customers and accounts receivable (#6). Owner: Finance agent.
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const CustomerPayment = require('../models/CustomerPayment');
const CustomerLedger = require('../models/CustomerLedger');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { audit } = require('../utils/audit');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { round2, EPS } = require('../services/credit');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIST = 500;
const trimStr = (v) => (v === undefined || v === null ? '' : String(v).trim());

const assertId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`Invalid ${label}`, 400);
};

// undefined/'' -> undefined (keep), null/'unlimited' -> null, number >= 0 -> number
const parseCreditLimit = (v) => {
  if (v === undefined || v === '') return undefined;
  if (v === null || v === 'unlimited') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new AppError('Credit limit must be a non-negative number', 400);
  return round2(n);
};

const findCustomer = async (req, session) => {
  assertId(req.params.id, 'customer id');
  const q = Customer.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (session) q.session(session);
  const customer = await q;
  if (!customer) throw new AppError('Customer not found', 404);
  return customer;
};

// A negative balance is store credit the pharmacy owes the customer. Archiving / deleting such a
// customer would strand it (inactive customers cannot use credit), so it is refused unless an
// owner forces it (?force=true or body.force: true). 409 CUSTOMER_HAS_STORE_CREDIT.
const isForced = (req) => req.query?.force === 'true' || req.query?.force === '1' || req.body?.force === true || req.body?.force === 'true';
const isOwner = (req) => req.membershipRole === 'owner' || req.user?.role === 'admin';
const assertNoStoreCredit = (req, customer) => {
  const credit = round2(-(Number(customer.balance) || 0));
  if (credit <= EPS) return 0;
  if (isForced(req) && isOwner(req)) return credit;
  const err = new AppError(
    `${customer.name} has ${credit.toFixed(2)} store credit. Use or refund it before removing or deactivating the customer${isOwner(req) ? ', or confirm to remove it anyway' : ' (only an owner can force this)'}.`,
    409
  );
  err.code = 'CUSTOMER_HAS_STORE_CREDIT';
  throw err;
};

const openSalesFilter = (pharmacyId, customerId) => ({
  pharmacyId,
  customerId,
  balanceDue: { $gt: 0 },
  voided: { $ne: true },
});

// @route GET /api/customers   (?search, ?active=true|false, ?hasBalance=true, ?page, ?limit)
const getCustomers = async (req, res) => {
  const { search, active, hasBalance } = req.query;
  const query = { pharmacyId: req.pharmacyId };
  if (active === 'true') query.active = true;
  if (active === 'false') query.active = false;
  if (hasBalance === 'true') query.balance = { $gt: EPS };
  if (search) {
    const pattern = escapeRegex(String(search).trim());
    query.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { phone: { $regex: pattern, $options: 'i' } },
      { email: { $regex: pattern, $options: 'i' } },
    ];
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIST, Math.max(1, parseInt(req.query.limit, 10) || MAX_LIST));

  const [customers, total, totals] = await Promise.all([
    Customer.find(query).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
    Customer.countDocuments(query),
    Customer.aggregate([
      { $match: { pharmacyId: req.pharmacyId } },
      {
        $group: {
          _id: null,
          receivable: { $sum: { $cond: [{ $gt: ['$balance', 0] }, '$balance', 0] } },
          withBalance: { $sum: { $cond: [{ $gt: ['$balance', EPS] }, 1, 0] } },
          active: { $sum: { $cond: ['$active', 1, 0] } },
        },
      },
    ]),
  ]);

  const summary = totals[0] || { receivable: 0, withBalance: 0, active: 0 };
  return res.status(200).json({
    success: true,
    count: customers.length,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    summary: { receivable: round2(summary.receivable), withBalance: summary.withBalance, active: summary.active },
    customers,
  });
};

// @route GET /api/customers/:id
const getCustomerById = async (req, res) => {
  const customer = await findCustomer(req);
  const openSales = await Sale.find(openSalesFilter(req.pharmacyId, customer._id))
    .sort({ createdAt: 1 })
    .select('invoiceNumber createdAt grandTotal amountPaid balanceDue paymentStatus')
    .lean();
  return res.status(200).json({ success: true, customer, openSales });
};

// @route POST /api/customers
const createCustomer = async (req, res) => {
  const body = req.body || {};
  const name = trimStr(body.name);
  if (!name) throw new AppError('Customer name is required', 400);
  const creditLimit = parseCreditLimit(body.creditLimit);

  const customer = await Customer.create({
    pharmacyId: req.pharmacyId,
    name,
    phone: trimStr(body.phone),
    email: trimStr(body.email),
    address: trimStr(body.address),
    notes: trimStr(body.notes),
    // Business buyers (B2B e-invoices)
    tin: trimStr(body.tin),
    legalName: trimStr(body.legalName),
    ...(creditLimit !== undefined ? { creditLimit } : {}),
    active: body.active === undefined ? true : Boolean(body.active),
  });

  await audit(req, { action: 'customer.create', entity: 'Customer', entityId: customer._id, after: customer });

  return res.status(201).json({ success: true, message: 'Customer created', customer });
};

// Sends an AppError carrying a machine-readable `code` with that code (the central error
// handler only sends the message); everything else is rethrown.
const withCode = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (err) {
    if (err && err.isOperational && typeof err.code === 'string' && !res.headersSent) {
      return res.status(err.status || 400).json({ success: false, code: err.code, message: err.message });
    }
    throw err;
  }
};

// @route PUT /api/customers/:id
const updateCustomer = withCode(async (req, res) => {
  const customer = await findCustomer(req);
  const before = customer.toObject();
  const body = req.body || {};

  if (body.name !== undefined) {
    const name = trimStr(body.name);
    if (!name) throw new AppError('Customer name is required', 400);
    customer.name = name;
  }
  if (body.phone !== undefined) customer.phone = trimStr(body.phone);
  if (body.email !== undefined) customer.email = trimStr(body.email);
  if (body.address !== undefined) customer.address = trimStr(body.address);
  if (body.notes !== undefined) customer.notes = trimStr(body.notes);
  if (body.tin !== undefined) customer.tin = trimStr(body.tin);
  if (body.legalName !== undefined) customer.legalName = trimStr(body.legalName);
  let forfeitedCredit = 0;
  if (body.active !== undefined) {
    const active = body.active === true || body.active === 'true' || (body.active !== false && body.active !== 'false' && Boolean(body.active));
    if (!active && customer.active) forfeitedCredit = assertNoStoreCredit(req, customer);
    customer.active = active;
  }
  const creditLimit = parseCreditLimit(body.creditLimit);
  if (creditLimit !== undefined) customer.creditLimit = creditLimit;
  // `balance` is never set directly: it only changes through sales, payments and reversals

  await customer.save();

  const limitChanged = before.creditLimit !== customer.creditLimit;
  await audit(req, {
    action: limitChanged ? 'customer.credit_limit_change' : 'customer.update',
    entity: 'Customer',
    entityId: customer._id,
    before,
    after: customer,
    ...(forfeitedCredit > 0 ? { meta: { forcedWithStoreCredit: forfeitedCredit } } : {}),
  });

  return res.status(200).json({ success: true, message: 'Customer updated', customer });
});

// @route DELETE /api/customers/:id  (deactivates when the customer has history)
const deleteCustomer = withCode(async (req, res) => {
  const customer = await findCustomer(req);
  if (round2(customer.balance) > 0) {
    throw new AppError('This customer has an outstanding balance. Collect it before removing the customer.', 409);
  }
  const forfeitedCredit = assertNoStoreCredit(req, customer);
  const scope = { pharmacyId: req.pharmacyId, customerId: customer._id };
  const hasHistory =
    (await Sale.exists(scope)) || (await CustomerPayment.exists(scope)) || (await CustomerLedger.exists(scope));

  if (hasHistory) {
    customer.active = false;
    await customer.save();
    await audit(req, {
      action: 'customer.deactivate',
      entity: 'Customer',
      entityId: customer._id,
      after: customer,
      ...(forfeitedCredit > 0 ? { meta: { forcedWithStoreCredit: forfeitedCredit } } : {}),
    });
    return res.status(200).json({
      success: true,
      archived: true,
      message: 'Customer has sales or payment history, so it was deactivated instead of deleted.',
    });
  }

  await customer.deleteOne();
  await audit(req, { action: 'customer.delete', entity: 'Customer', entityId: customer._id, before: customer });
  return res.status(200).json({ success: true, archived: false, message: 'Customer deleted' });
});

// Allocates `amount` to open sales: explicit allocations first, then oldest-first.
const allocateToSales = async ({ pharmacyId, customerId, amount, requested, session }) => {
  const openSales = await Sale.find(openSalesFilter(pharmacyId, customerId))
    .sort({ createdAt: 1, _id: 1 })
    .select('invoiceNumber balanceDue amountPaid grandTotal createdAt')
    .session(session);
  const byId = new Map(openSales.map((s) => [String(s._id), s]));
  const plan = new Map(); // saleId -> amount
  let remaining = amount;

  if (Array.isArray(requested)) {
    for (const a of requested) {
      if (!a || !mongoose.isValidObjectId(a.saleId)) throw new AppError('Invalid sale in allocations', 400);
      const sale = byId.get(String(a.saleId));
      if (!sale) throw new AppError('Allocation refers to a sale that is not open for this customer', 400);
      const amt = round2(a.amount);
      if (!(amt > 0)) throw new AppError('Allocation amounts must be positive', 400);
      const already = plan.get(String(sale._id)) || 0;
      if (already + amt > round2(sale.balanceDue) + EPS) {
        throw new AppError(`Allocation exceeds the balance due on ${sale.invoiceNumber}`, 400);
      }
      if (amt > remaining + EPS) throw new AppError('Allocations exceed the payment amount', 400);
      plan.set(String(sale._id), round2(already + amt));
      remaining = round2(remaining - amt);
    }
  }

  for (const sale of openSales) {
    if (remaining <= EPS) break;
    const already = plan.get(String(sale._id)) || 0;
    const room = round2(sale.balanceDue - already);
    if (room <= EPS) continue;
    const amt = round2(Math.min(room, remaining));
    plan.set(String(sale._id), round2(already + amt));
    remaining = round2(remaining - amt);
  }

  const allocations = [];
  for (const sale of openSales) {
    const amt = plan.get(String(sale._id));
    if (!amt) continue;
    const newDue = round2(Math.max(0, sale.balanceDue - amt));
    const paidBefore =
      sale.amountPaid !== undefined && sale.amountPaid !== null
        ? sale.amountPaid
        : Math.max(0, (sale.grandTotal || 0) - (sale.balanceDue || 0));
    const result = await Sale.updateOne(
      { _id: sale._id, pharmacyId, balanceDue: sale.balanceDue },
      {
        $set: {
          balanceDue: newDue,
          amountPaid: round2(paidBefore + amt),
          paymentStatus: newDue <= EPS ? 'paid' : 'partial',
        },
      },
      { session }
    );
    if (result.matchedCount !== 1) throw new AppError('Sale balance changed, please retry', 409);
    allocations.push({ saleId: sale._id, invoiceNumber: sale.invoiceNumber, amount: amt });
  }

  return { allocations, unallocated: round2(Math.max(0, remaining)) };
};

// @route POST /api/customers/:id/payments  { amount, method, reference, note, allocations? }
const recordPayment = async (req, res) => {
  assertId(req.params.id, 'customer id');
  const body = req.body || {};
  const amount = round2(body.amount);
  if (!Number.isFinite(Number(body.amount)) || amount <= 0) {
    throw new AppError('Payment amount must be a positive number', 400);
  }
  const method = trimStr(body.method) || 'cash';
  if (!CustomerPayment.PAYMENT_METHODS.includes(method)) throw new AppError('Invalid payment method', 400);
  if (body.allocations !== undefined && !Array.isArray(body.allocations)) {
    throw new AppError('allocations must be an array', 400);
  }

  const session = await mongoose.startSession();
  try {
    let payment;
    let customerAfter;
    await session.withTransaction(async () => {
      const customer = await findCustomer(req, session);
      const owed = round2(customer.balance);
      if (owed <= 0) throw new AppError('This customer has no outstanding balance', 400);
      if (amount > owed + EPS) {
        throw new AppError(`Payment exceeds the outstanding balance of ${owed.toFixed(2)}`, 400);
      }

      const { allocations, unallocated } = await allocateToSales({
        pharmacyId: req.pharmacyId,
        customerId: customer._id,
        amount,
        requested: body.allocations,
        session,
      });

      customerAfter = await Customer.findOneAndUpdate(
        { _id: customer._id, pharmacyId: req.pharmacyId, balance: { $gte: amount - EPS } },
        { $inc: { balance: -amount } },
        { returnDocument: 'after', session }
      );
      if (!customerAfter) throw new AppError('Customer balance changed, please retry', 409);
      if (customerAfter.balance < 0 && customerAfter.balance > -EPS) {
        await Customer.updateOne({ _id: customer._id }, { $set: { balance: 0 } }, { session });
        customerAfter.balance = 0;
      }

      const seq = await nextSequence(req.pharmacyId, 'customer_payment', { session });
      [payment] = await CustomerPayment.create(
        [
          {
            pharmacyId: req.pharmacyId,
            customerId: customer._id,
            paymentNo: formatSequence('RCPT', seq),
            amount,
            method,
            reference: trimStr(body.reference),
            note: trimStr(body.note),
            allocations,
            unallocated,
            receivedBy: req.user._id,
          },
        ],
        { session }
      );

      await CustomerLedger.create(
        [
          {
            pharmacyId: req.pharmacyId,
            customerId: customer._id,
            type: 'payment',
            amount: -amount,
            balanceAfter: round2(customerAfter.balance),
            refId: payment._id,
            refModel: 'CustomerPayment',
            note: method,
          },
        ],
        { session }
      );

      await audit(
        req,
        {
          action: 'customer.payment',
          entity: 'CustomerPayment',
          entityId: payment._id,
          before: { balance: owed },
          after: payment,
          meta: { customerId: customer._id, balanceAfter: round2(customerAfter.balance) },
        },
        { session }
      );
    });

    return res.status(201).json({
      success: true,
      message: `Payment ${payment.paymentNo} recorded`,
      payment,
      customer: customerAfter,
    });
  } finally {
    await session.endSession();
  }
};

// @route GET /api/customers/:id/payments
const getPayments = async (req, res) => {
  const customer = await findCustomer(req);
  const payments = await CustomerPayment.find({ pharmacyId: req.pharmacyId, customerId: customer._id })
    .sort({ date: -1 })
    .limit(200)
    .populate('receivedBy', 'name')
    .lean();
  return res.status(200).json({ success: true, count: payments.length, payments });
};

const parseDate = (v, endOfDay = false) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError('Invalid date', 400);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setUTCHours(23, 59, 59, 999);
  return d;
};

// @route GET /api/customers/:id/statement  (?from, ?to)
const getStatement = async (req, res) => {
  const customer = await findCustomer(req);
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to, true);
  const scope = { pharmacyId: req.pharmacyId, customerId: customer._id };

  let openingBalance = 0;
  if (from) {
    const before = await CustomerLedger.aggregate([
      { $match: { ...scope, date: { $lt: from } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    openingBalance = round2(before[0]?.total || 0);
  }

  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  const entries = await CustomerLedger.find({ ...scope, ...(from || to ? { date: range } : {}) })
    .sort({ date: 1, _id: 1 })
    .lean();

  // Enrich with document numbers
  const saleIds = entries.filter((e) => e.saleId).map((e) => e.saleId);
  const paymentIds = entries.filter((e) => e.refModel === 'CustomerPayment').map((e) => e.refId);
  const returnIds = entries.filter((e) => e.refModel === 'Return').map((e) => e.refId);
  const Return = mongoose.models.Return;
  const [sales, payments, returns] = await Promise.all([
    saleIds.length
      ? Sale.find({ _id: { $in: saleIds }, pharmacyId: req.pharmacyId }).select('invoiceNumber grandTotal').lean()
      : [],
    paymentIds.length
      ? CustomerPayment.find({ _id: { $in: paymentIds }, pharmacyId: req.pharmacyId })
          .select('paymentNo method reference')
          .lean()
      : [],
    returnIds.length && Return
      ? Return.find({ _id: { $in: returnIds }, pharmacyId: req.pharmacyId }).select('returnNumber').lean()
      : [],
  ]);
  const saleMap = new Map(sales.map((s) => [String(s._id), s]));
  const payMap = new Map(payments.map((p) => [String(p._id), p]));
  const retMap = new Map(returns.map((r) => [String(r._id), r]));

  let running = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  const lines = entries.map((e) => {
    const debit = e.amount > 0 ? round2(e.amount) : 0;
    const credit = e.amount < 0 ? round2(-e.amount) : 0;
    totalDebit += debit;
    totalCredit += credit;
    running = round2(running + debit - credit);
    const sale = e.saleId ? saleMap.get(String(e.saleId)) : null;
    let description = '';
    let reference = '';
    if (e.type === 'sale') {
      description = 'Credit sale';
      reference = sale?.invoiceNumber || '';
    } else if (e.type === 'payment') {
      const p = payMap.get(String(e.refId));
      description = `Payment${p?.method ? ` (${p.method.replace('_', ' ')})` : ''}`;
      reference = p?.paymentNo || '';
    } else if (e.type === 'reversal') {
      const r = e.refId ? retMap.get(String(e.refId)) : null;
      description = r ? 'Return credit' : 'Sale voided / reversed';
      reference = r?.returnNumber || sale?.invoiceNumber || '';
    } else {
      description = e.note || 'Adjustment';
    }
    return {
      _id: e._id,
      date: e.date,
      type: e.type,
      description,
      reference,
      saleId: e.saleId,
      refId: e.refId,
      debit,
      credit,
      balance: running,
    };
  });

  return res.status(200).json({
    success: true,
    customer,
    from,
    to,
    openingBalance,
    closingBalance: running,
    totals: { debit: round2(totalDebit), credit: round2(totalCredit) },
    entries: lines,
  });
};

const BUCKETS = ['0-30', '31-60', '61-90', '90+'];

// @route GET /api/customers/aging  (?customerId)
// Buckets open credit sales' balanceDue by the sale date.
const getAging = async (req, res) => {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const d60 = new Date(now.getTime() - 60 * DAY_MS);
  const d90 = new Date(now.getTime() - 90 * DAY_MS);

  const match = {
    pharmacyId: req.pharmacyId,
    customerId: { $ne: null },
    balanceDue: { $gt: 0 },
    voided: { $ne: true },
  };
  if (req.query.customerId) {
    assertId(req.query.customerId, 'customer id');
    match.customerId = new mongoose.Types.ObjectId(String(req.query.customerId));
  }

  const bucketSum = (cond) => ({ $sum: { $cond: [cond, '$balanceDue', 0] } });
  const rows = await Sale.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$customerId',
        b0: bucketSum({ $gte: ['$createdAt', d30] }),
        b30: bucketSum({ $and: [{ $lt: ['$createdAt', d30] }, { $gte: ['$createdAt', d60] }] }),
        b60: bucketSum({ $and: [{ $lt: ['$createdAt', d60] }, { $gte: ['$createdAt', d90] }] }),
        b90: bucketSum({ $lt: ['$createdAt', d90] }),
        total: { $sum: '$balanceDue' },
        openSales: { $sum: 1 },
        oldest: { $min: '$createdAt' },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const customers = await Customer.find({ _id: { $in: rows.map((r) => r._id) }, pharmacyId: req.pharmacyId })
    .select('name phone creditLimit balance active')
    .lean();
  const custMap = new Map(customers.map((c) => [String(c._id), c]));

  const totals = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
  const result = rows.map((r) => {
    const buckets = { '0-30': round2(r.b0), '31-60': round2(r.b30), '61-90': round2(r.b60), '90+': round2(r.b90) };
    BUCKETS.forEach((b) => {
      totals[b] = round2(totals[b] + buckets[b]);
    });
    totals.total = round2(totals.total + r.total);
    const c = custMap.get(String(r._id));
    return {
      customerId: r._id,
      name: c?.name || 'Unknown customer',
      phone: c?.phone || '',
      creditLimit: c ? c.creditLimit : null,
      balance: c ? round2(c.balance) : null,
      buckets,
      total: round2(r.total),
      openSales: r.openSales,
      oldest: r.oldest,
    };
  });

  return res.status(200).json({ success: true, asOf: now, buckets: BUCKETS, totals, customers: result });
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  recordPayment,
  getPayments,
  getStatement,
  getAging,
};
