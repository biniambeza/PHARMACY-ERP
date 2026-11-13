// Supplier invoices, payments and accounts payable (#10). Owner: Finance agent.
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const SupplierInvoice = require('../models/SupplierInvoice');
const SupplierPayment = require('../models/SupplierPayment');
const PurchaseOrder = require('../models/PurchaseOrder');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { audit } = require('../utils/audit');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { invoiceStatus, defaultDueDate, round2, EPS, DAY_MS } = require('../services/payables');

const trimStr = (v) => (v === undefined || v === null ? '' : String(v).trim());
const assertId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`Invalid ${label}`, 400);
};
const parseDate = (v, label) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${label}`, 400);
  return d;
};
const oid = (v) => new mongoose.Types.ObjectId(String(v));

const findSupplier = async (pharmacyId, supplierId, session) => {
  assertId(supplierId, 'supplier id');
  const q = Supplier.findOne({ _id: supplierId, pharmacyId });
  if (session) q.session(session);
  const supplier = await q;
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
};

const findInvoice = async (req) => {
  assertId(req.params.id, 'invoice id');
  const invoice = await SupplierInvoice.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!invoice) throw new AppError('Invoice not found', 404);
  return invoice;
};

// ---------- Invoices ----------

// @route GET /api/payables/invoices  (?supplierId, ?status=open|partial|paid|unpaid, ?overdue=true, ?search)
const getInvoices = async (req, res) => {
  const { supplierId, status, overdue, search } = req.query;
  const query = { pharmacyId: req.pharmacyId };
  if (supplierId) {
    assertId(supplierId, 'supplier id');
    query.supplierId = oid(supplierId);
  }
  if (status === 'unpaid') query.status = { $in: ['open', 'partial'] };
  else if (['open', 'partial', 'paid'].includes(status)) query.status = status;
  if (overdue === 'true') {
    query.status = { $in: ['open', 'partial'] };
    query.dueDate = { $lt: new Date() };
  }
  if (search) query.invoiceNo = { $regex: escapeRegex(String(search).trim()), $options: 'i' };

  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
  const invoices = await SupplierInvoice.find(query)
    .sort({ dueDate: 1, invoiceDate: 1 })
    .limit(limit)
    .populate('supplierId', 'name phone paymentTermsDays')
    .populate('purchaseOrderId', 'poNumber');
  return res.status(200).json({ success: true, count: invoices.length, invoices });
};

// @route GET /api/payables/invoices/:id
const getInvoiceById = async (req, res) => {
  const invoice = await findInvoice(req);
  await invoice.populate([
    { path: 'supplierId', select: 'name phone paymentTermsDays' },
    { path: 'purchaseOrderId', select: 'poNumber totalAmount' },
  ]);
  const payments = await SupplierPayment.find({ pharmacyId: req.pharmacyId, 'allocations.invoiceId': invoice._id })
    .sort({ date: -1 })
    .lean();
  return res.status(200).json({ success: true, invoice, payments });
};

// @route POST /api/payables/invoices  { supplierId, invoiceNo, invoiceDate?, dueDate?, amount, purchaseOrderId?, notes? }
const createInvoice = async (req, res) => {
  const body = req.body || {};
  const supplier = await findSupplier(req.pharmacyId, body.supplierId);
  const invoiceNo = trimStr(body.invoiceNo);
  if (!invoiceNo) throw new AppError('Invoice number is required', 400);
  const amount = round2(body.amount);
  if (!Number.isFinite(Number(body.amount)) || amount <= 0) throw new AppError('Invoice amount must be positive', 400);

  const invoiceDate = body.invoiceDate ? parseDate(body.invoiceDate, 'invoice date') : new Date();
  const dueDate = body.dueDate ? parseDate(body.dueDate, 'due date') : defaultDueDate(invoiceDate, supplier);
  if (dueDate < new Date(invoiceDate.getTime() - DAY_MS)) {
    throw new AppError('Due date cannot be before the invoice date', 400);
  }

  let purchaseOrderId = null;
  if (body.purchaseOrderId) {
    // Explicit string check + cast: a body value must never reach the filter as an object/operator
    if (typeof body.purchaseOrderId !== 'string' || !mongoose.isValidObjectId(body.purchaseOrderId)) {
      throw new AppError('Invalid purchase order id', 400);
    }
    const poId = new mongoose.Types.ObjectId(body.purchaseOrderId);
    const po = await PurchaseOrder.findOne({ _id: poId, pharmacyId: req.pharmacyId });
    if (!po) throw new AppError('Purchase order not found', 404);
    if (String(po.supplierId) !== String(supplier._id)) {
      throw new AppError('Purchase order belongs to a different supplier', 400);
    }
    purchaseOrderId = po._id;
  }

  const invoice = await SupplierInvoice.create({
    pharmacyId: req.pharmacyId,
    supplierId: supplier._id,
    purchaseOrderId,
    invoiceNo,
    invoiceDate,
    dueDate,
    amount,
    amountPaid: 0,
    status: 'open',
    notes: trimStr(body.notes),
    createdBy: req.user._id,
  });

  await audit(req, { action: 'supplier_invoice.create', entity: 'SupplierInvoice', entityId: invoice._id, after: invoice });
  return res.status(201).json({ success: true, message: 'Invoice recorded', invoice });
};

// @route PUT /api/payables/invoices/:id  { invoiceNo?, invoiceDate?, dueDate?, amount?, notes? }
const updateInvoice = async (req, res) => {
  const invoice = await findInvoice(req);
  const before = invoice.toObject();
  const body = req.body || {};

  if (body.invoiceNo !== undefined) {
    const no = trimStr(body.invoiceNo);
    if (!no) throw new AppError('Invoice number is required', 400);
    invoice.invoiceNo = no;
  }
  if (body.invoiceDate !== undefined) invoice.invoiceDate = parseDate(body.invoiceDate, 'invoice date');
  if (body.dueDate !== undefined) invoice.dueDate = parseDate(body.dueDate, 'due date');
  if (body.notes !== undefined) invoice.notes = trimStr(body.notes);
  if (body.amount !== undefined) {
    const amount = round2(body.amount);
    if (!Number.isFinite(Number(body.amount)) || amount <= 0) throw new AppError('Invoice amount must be positive', 400);
    if (amount < round2(invoice.amountPaid) - EPS) {
      throw new AppError('Invoice amount cannot be less than what has already been paid', 400);
    }
    invoice.amount = amount;
  }
  invoice.status = invoiceStatus(invoice.amount, invoice.amountPaid);

  // Optimistic guard against a payment landing between read and save
  const result = await SupplierInvoice.updateOne(
    { _id: invoice._id, pharmacyId: req.pharmacyId, amountPaid: before.amountPaid },
    {
      $set: {
        invoiceNo: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        amount: invoice.amount,
        status: invoice.status,
      },
    },
    { runValidators: true }
  );
  if (result.matchedCount !== 1) throw new AppError('Invoice changed while saving, please retry', 409);
  const updated = await SupplierInvoice.findById(invoice._id);

  await audit(req, {
    action: 'supplier_invoice.update',
    entity: 'SupplierInvoice',
    entityId: invoice._id,
    before,
    after: updated,
  });
  return res.status(200).json({ success: true, message: 'Invoice updated', invoice: updated });
};

// @route DELETE /api/payables/invoices/:id  (only unpaid invoices)
const deleteInvoice = async (req, res) => {
  assertId(req.params.id, 'invoice id');
  const invoice = await SupplierInvoice.findOneAndDelete({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
    amountPaid: { $lte: 0 },
  });
  if (!invoice) {
    const exists = await SupplierInvoice.exists({ _id: req.params.id, pharmacyId: req.pharmacyId });
    if (exists) throw new AppError('Invoices with payments cannot be deleted', 409);
    throw new AppError('Invoice not found', 404);
  }
  await audit(req, { action: 'supplier_invoice.delete', entity: 'SupplierInvoice', entityId: invoice._id, before: invoice });
  return res.status(200).json({ success: true, message: 'Invoice deleted' });
};

// ---------- Payments ----------

// @route GET /api/payables/payments  (?supplierId)
const getPayments = async (req, res) => {
  const query = { pharmacyId: req.pharmacyId };
  if (req.query.supplierId) {
    assertId(req.query.supplierId, 'supplier id');
    query.supplierId = oid(req.query.supplierId);
  }
  const payments = await SupplierPayment.find(query)
    .sort({ date: -1 })
    .limit(300)
    .populate('supplierId', 'name')
    .populate('paidBy', 'name')
    .lean();
  return res.status(200).json({ success: true, count: payments.length, payments });
};

// @route POST /api/payables/payments  { supplierId, amount, method, reference?, note?, date?, allocations?: [{invoiceId, amount}] }
// Explicit allocations are applied first; the rest goes to the oldest-due open invoices.
const recordPayment = async (req, res) => {
  const body = req.body || {};
  const amount = round2(body.amount);
  if (!Number.isFinite(Number(body.amount)) || amount <= 0) throw new AppError('Payment amount must be positive', 400);
  const method = trimStr(body.method) || 'bank_transfer';
  if (!SupplierPayment.PAYMENT_METHODS.includes(method)) throw new AppError('Invalid payment method', 400);
  if (body.allocations !== undefined && !Array.isArray(body.allocations)) {
    throw new AppError('allocations must be an array', 400);
  }
  const date = body.date ? parseDate(body.date, 'payment date') : new Date();

  const session = await mongoose.startSession();
  try {
    let payment;
    await session.withTransaction(async () => {
      const supplier = await findSupplier(req.pharmacyId, body.supplierId, session);
      const open = await SupplierInvoice.find({
        pharmacyId: req.pharmacyId,
        supplierId: supplier._id,
        status: { $in: ['open', 'partial'] },
      })
        .sort({ dueDate: 1, invoiceDate: 1, _id: 1 })
        .session(session);

      const outstanding = round2(open.reduce((s, i) => s + (i.amount - i.amountPaid), 0));
      if (outstanding <= 0) throw new AppError('This supplier has no unpaid invoices', 400);
      if (amount > outstanding + EPS) {
        throw new AppError(`Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}`, 400);
      }

      const byId = new Map(open.map((i) => [String(i._id), i]));
      const plan = new Map();
      let remaining = amount;
      for (const a of body.allocations || []) {
        if (!a || !mongoose.isValidObjectId(a.invoiceId)) throw new AppError('Invalid invoice in allocations', 400);
        const inv = byId.get(String(a.invoiceId));
        if (!inv) throw new AppError('Allocation refers to an invoice that is not open for this supplier', 400);
        const amt = round2(a.amount);
        if (!(amt > 0)) throw new AppError('Allocation amounts must be positive', 400);
        const already = plan.get(String(inv._id)) || 0;
        if (already + amt > round2(inv.amount - inv.amountPaid) + EPS) {
          throw new AppError(`Allocation exceeds the balance of invoice ${inv.invoiceNo}`, 400);
        }
        if (amt > remaining + EPS) throw new AppError('Allocations exceed the payment amount', 400);
        plan.set(String(inv._id), round2(already + amt));
        remaining = round2(remaining - amt);
      }
      for (const inv of open) {
        if (remaining <= EPS) break;
        const already = plan.get(String(inv._id)) || 0;
        const room = round2(inv.amount - inv.amountPaid - already);
        if (room <= EPS) continue;
        const amt = round2(Math.min(room, remaining));
        plan.set(String(inv._id), round2(already + amt));
        remaining = round2(remaining - amt);
      }

      const allocations = [];
      for (const inv of open) {
        const amt = plan.get(String(inv._id));
        if (!amt) continue;
        const newPaid = round2(inv.amountPaid + amt);
        const result = await SupplierInvoice.updateOne(
          { _id: inv._id, pharmacyId: req.pharmacyId, amountPaid: inv.amountPaid },
          { $set: { amountPaid: newPaid, status: invoiceStatus(inv.amount, newPaid) } },
          { session }
        );
        if (result.matchedCount !== 1) throw new AppError('Invoice changed, please retry', 409);
        allocations.push({ invoiceId: inv._id, invoiceNo: inv.invoiceNo, amount: amt });
      }

      const seq = await nextSequence(req.pharmacyId, 'supplier_payment', { session });
      [payment] = await SupplierPayment.create(
        [
          {
            pharmacyId: req.pharmacyId,
            supplierId: supplier._id,
            paymentNo: formatSequence('SPAY', seq),
            amount,
            method,
            reference: trimStr(body.reference),
            note: trimStr(body.note),
            date,
            allocations,
            paidBy: req.user._id,
          },
        ],
        { session }
      );

      await audit(
        req,
        {
          action: 'supplier.payment',
          entity: 'SupplierPayment',
          entityId: payment._id,
          after: payment,
          meta: { supplierId: supplier._id, outstandingBefore: outstanding },
        },
        { session }
      );
    });

    return res.status(201).json({ success: true, message: `Payment ${payment.paymentNo} recorded`, payment });
  } finally {
    await session.endSession();
  }
};

// ---------- Balances and aging ----------

// Outstanding per supplier: { [supplierId]: { outstanding, overdue, openInvoices, nextDue } }
const supplierBalances = async (pharmacyId, supplierIds) => {
  const match = { pharmacyId, status: { $in: ['open', 'partial'] } };
  if (supplierIds) match.supplierId = { $in: supplierIds };
  const now = new Date();
  const rows = await SupplierInvoice.aggregate([
    { $match: match },
    { $addFields: { due: { $subtract: ['$amount', '$amountPaid'] } } },
    {
      $group: {
        _id: '$supplierId',
        outstanding: { $sum: '$due' },
        overdue: { $sum: { $cond: [{ $lt: ['$dueDate', now] }, '$due', 0] } },
        openInvoices: { $sum: 1 },
        nextDue: { $min: '$dueDate' },
      },
    },
  ]);
  const map = new Map();
  rows.forEach((r) =>
    map.set(String(r._id), {
      outstanding: round2(r.outstanding),
      overdue: round2(r.overdue),
      openInvoices: r.openInvoices,
      nextDue: r.nextDue,
    })
  );
  return map;
};

// @route GET /api/payables/balances
const getBalances = async (req, res) => {
  const map = await supplierBalances(req.pharmacyId);
  const suppliers = await Supplier.find({ _id: { $in: [...map.keys()].map(oid) }, pharmacyId: req.pharmacyId })
    .select('name phone paymentTermsDays')
    .lean();
  const balances = suppliers
    .map((s) => ({ supplierId: s._id, name: s.name, phone: s.phone, paymentTermsDays: s.paymentTermsDays, ...map.get(String(s._id)) }))
    .sort((a, b) => b.outstanding - a.outstanding);
  const totals = balances.reduce(
    (t, b) => ({ outstanding: round2(t.outstanding + b.outstanding), overdue: round2(t.overdue + b.overdue) }),
    { outstanding: 0, overdue: 0 }
  );
  return res.status(200).json({ success: true, totals, balances });
};

// @route GET /api/payables/suppliers/:supplierId
const getSupplierAccount = async (req, res) => {
  const supplier = await findSupplier(req.pharmacyId, req.params.supplierId);
  const [invoices, payments, map] = await Promise.all([
    SupplierInvoice.find({ pharmacyId: req.pharmacyId, supplierId: supplier._id })
      .sort({ invoiceDate: -1 })
      .limit(300)
      .populate('purchaseOrderId', 'poNumber'),
    SupplierPayment.find({ pharmacyId: req.pharmacyId, supplierId: supplier._id }).sort({ date: -1 }).limit(300).lean(),
    supplierBalances(req.pharmacyId, [supplier._id]),
  ]);
  const balance = map.get(String(supplier._id)) || { outstanding: 0, overdue: 0, openInvoices: 0, nextDue: null };
  return res.status(200).json({ success: true, supplier, balance, invoices, payments });
};

const AP_BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'];

// @route GET /api/payables/aging
// Buckets unpaid invoice balances by days past their due date.
const getAging = async (req, res) => {
  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * DAY_MS);
  const sumIf = (cond) => ({ $sum: { $cond: [cond, '$due', 0] } });
  const rows = await SupplierInvoice.aggregate([
    { $match: { pharmacyId: req.pharmacyId, status: { $in: ['open', 'partial'] } } },
    { $addFields: { due: { $subtract: ['$amount', '$amountPaid'] } } },
    {
      $group: {
        _id: '$supplierId',
        current: sumIf({ $gte: ['$dueDate', now] }),
        d1: sumIf({ $and: [{ $lt: ['$dueDate', now] }, { $gte: ['$dueDate', ago(30)] }] }),
        d31: sumIf({ $and: [{ $lt: ['$dueDate', ago(30)] }, { $gte: ['$dueDate', ago(60)] }] }),
        d61: sumIf({ $and: [{ $lt: ['$dueDate', ago(60)] }, { $gte: ['$dueDate', ago(90)] }] }),
        d90: sumIf({ $lt: ['$dueDate', ago(90)] }),
        total: { $sum: '$due' },
        openInvoices: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);
  const suppliers = await Supplier.find({ _id: { $in: rows.map((r) => r._id) }, pharmacyId: req.pharmacyId })
    .select('name')
    .lean();
  const names = new Map(suppliers.map((s) => [String(s._id), s.name]));
  const totals = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
  const result = rows.map((r) => {
    const buckets = {
      current: round2(r.current),
      '1-30': round2(r.d1),
      '31-60': round2(r.d31),
      '61-90': round2(r.d61),
      '90+': round2(r.d90),
    };
    AP_BUCKETS.forEach((b) => {
      totals[b] = round2(totals[b] + buckets[b]);
    });
    totals.total = round2(totals.total + r.total);
    return {
      supplierId: r._id,
      name: names.get(String(r._id)) || 'Unknown supplier',
      buckets,
      total: round2(r.total),
      openInvoices: r.openInvoices,
    };
  });
  return res.status(200).json({ success: true, asOf: now, buckets: AP_BUCKETS, totals, suppliers: result });
};

module.exports = {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getPayments,
  recordPayment,
  getBalances,
  getSupplierAccount,
  getAging,
  supplierBalances,
};
