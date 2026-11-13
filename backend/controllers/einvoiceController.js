// Fiscal e-invoicing endpoints (/api/einvoice).
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const escapeRegex = require('../utils/escapeRegex');
const Pharmacy = require('../models/Pharmacy');
const Sale = require('../models/Sale');
const Return = require('../models/Return');
const FiscalInvoice = require('../models/FiscalInvoice');
const einvoice = require('../services/einvoice');
const { TIN_RE } = require('../services/einvoice/payload');

const STATUS_FILTERS = [...FiscalInvoice.STATUSES, 'unsubmitted'];
const MAX_RANGE_DAYS = 92;

const loadPharmacy = async (req) => {
  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);
  return pharmacy;
};

const settingsSnapshot = (p) => ({
  tin: p.tin,
  vatRegNo: p.vatRegNo,
  vatRegistered: p.vatRegistered,
  einvoice: p.einvoice ? { ...(p.einvoice.toObject ? p.einvoice.toObject() : p.einvoice) } : null,
});

// @route GET /api/einvoice/settings   (einvoice:view)
const getSettings = async (req, res) => {
  const pharmacy = await loadPharmacy(req);
  res.status(200).json({ success: true, settings: einvoice.getSettings(pharmacy) });
};

const asBool = (v, field) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new AppError(`${field} must be true or false`, 400);
};

const asText = (v, field, max) => {
  if (v === null) return '';
  if (typeof v !== 'string') throw new AppError(`${field} must be text`, 400);
  const s = v.trim();
  if (s.length > max) throw new AppError(`${field} must be at most ${max} characters`, 400);
  return s;
};

// @route PUT /api/einvoice/settings   (einvoice:manage, owner)
// Body: { tin?, vatRegNo?, vatRegistered?, enabled?, provider?, mode? }
const updateSettings = async (req, res) => {
  const body = req.body || {};
  const pharmacy = await loadPharmacy(req);
  const set = {};

  if (body.tin !== undefined) {
    const tin = asText(body.tin, 'TIN', 20);
    if (tin && !TIN_RE.test(tin)) throw new AppError('TIN may only contain letters, digits and dashes (4-20)', 400);
    set.tin = tin;
  }
  if (body.vatRegNo !== undefined) set.vatRegNo = asText(body.vatRegNo, 'VAT registration number', 50);
  if (body.vatRegistered !== undefined) set.vatRegistered = asBool(body.vatRegistered, 'VAT registered');
  if (body.enabled !== undefined) set['einvoice.enabled'] = asBool(body.enabled, 'Enabled');
  if (body.provider !== undefined) {
    if (!FiscalInvoice.PROVIDERS.includes(body.provider)) {
      throw new AppError(`Provider must be one of ${FiscalInvoice.PROVIDERS.join(', ')}`, 400);
    }
    set['einvoice.provider'] = body.provider;
  }
  if (body.mode !== undefined) {
    if (!['sandbox', 'production'].includes(body.mode)) throw new AppError('Mode must be sandbox or production', 400);
    set['einvoice.mode'] = body.mode;
  }

  const provider = set['einvoice.provider'] ?? pharmacy.einvoice?.provider ?? 'none';
  const mode = set['einvoice.mode'] ?? pharmacy.einvoice?.mode ?? 'sandbox';
  const enabled = set['einvoice.enabled'] ?? pharmacy.einvoice?.enabled ?? false;
  const tin = set.tin ?? pharmacy.tin ?? '';
  if (provider === 'mock' && mode === 'production') {
    throw new AppError('The mock provider is for testing only and cannot be used in production mode', 400);
  }
  if (enabled && provider !== 'none' && !tin) {
    throw new AppError('Set the pharmacy TIN before enabling fiscal submission', 400);
  }

  if (Object.keys(set).length === 0) {
    return res.status(200).json({ success: true, message: 'Nothing to update', settings: einvoice.getSettings(pharmacy) });
  }

  const before = settingsSnapshot(pharmacy);
  const updated = await Pharmacy.findOneAndUpdate(
    { _id: pharmacy._id },
    { $set: set },
    { returnDocument: 'after', runValidators: true }
  );
  await audit(req, {
    action: 'einvoice.settings_update',
    entity: 'Pharmacy',
    entityId: pharmacy._id,
    before,
    after: settingsSnapshot(updated),
    meta: { fields: Object.keys(set) },
  });

  return res.status(200).json({ success: true, message: 'E-invoicing settings saved', settings: einvoice.getSettings(updated) });
};

const parseDate = (v, field, endOfDay = false) => {
  if (v === undefined || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError(`${field} is not a valid date`, 400);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setUTCHours(23, 59, 59, 999);
  return d;
};

// @route GET /api/einvoice?status=&from=&to=&search=&page=&limit=   (einvoice:view)
// Sales with their fiscal status ('unsubmitted' = no fiscal record yet).
const listInvoices = async (req, res) => {
  const { status, search } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  if (status && !STATUS_FILTERS.includes(status)) {
    throw new AppError(`Status must be one of ${STATUS_FILTERS.join(', ')}`, 400);
  }

  const match = { pharmacyId: req.pharmacyId };
  const from = parseDate(req.query.from, 'from');
  const to = parseDate(req.query.to, 'to', true);
  if (from || to) match.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (typeof search === 'string' && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim().slice(0, 100)), 'i');
    match.$or = [{ invoiceNumber: rx }, { 'customer.name': rx }];
  }

  const statusMatch = status ? [{ $match: { fiscalStatus: status } }] : [];
  const rows = await Sale.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: FiscalInvoice.collection.name,
        let: { sid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$saleId', '$$sid'] }, { $eq: ['$type', 'invoice'] }] } } },
          { $project: { payload: 0, providerResponse: 0 } },
        ],
        as: 'fiscal',
      },
    },
    { $addFields: { fiscal: { $arrayElemAt: ['$fiscal', 0] } } },
    { $addFields: { fiscalStatus: { $ifNull: ['$fiscal.status', 'unsubmitted'] } } },
    {
      $facet: {
        counts: [{ $group: { _id: '$fiscalStatus', count: { $sum: 1 } } }],
        total: [...statusMatch, { $count: 'n' }],
        items: [
          ...statusMatch,
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              invoiceNumber: 1,
              createdAt: 1,
              customer: 1,
              customerId: 1,
              grandTotal: 1,
              tax: 1,
              voided: 1,
              returnStatus: 1,
              fiscalStatus: 1,
              fiscal: 1,
            },
          },
        ],
      },
    },
  ]);

  const inner = rows[0] || { counts: [], total: [], items: [] };
  const counts = Object.fromEntries(STATUS_FILTERS.map((s) => [s, 0]));
  (inner.counts || []).forEach((c) => { counts[c._id] = c.count; });

  res.status(200).json({
    success: true,
    sales: inner.items,
    total: inner.total[0]?.n || 0,
    page,
    limit,
    counts,
  });
};

// @route GET /api/einvoice/:saleId   (einvoice:view)
const getInvoice = async (req, res) => {
  const { saleId } = req.params;
  if (!mongoose.isValidObjectId(saleId)) throw new AppError('Invalid sale id', 400);
  const sale = await Sale.findOne({ _id: saleId, pharmacyId: req.pharmacyId })
    .select('invoiceNumber createdAt customer customerId items subtotal discount tax taxLines grandTotal voided returnStatus paymentMethod')
    .lean();
  if (!sale) throw new AppError('Sale not found', 404);

  const [invoice, creditNotes, returns] = await Promise.all([
    FiscalInvoice.findOne({ pharmacyId: req.pharmacyId, saleId: sale._id, type: 'invoice' }).lean(),
    FiscalInvoice.find({ pharmacyId: req.pharmacyId, saleId: sale._id, type: 'credit_note' }).sort({ createdAt: 1 }).lean(),
    Return.find({ pharmacyId: req.pharmacyId, saleId: sale._id })
      .select('returnNumber refundTotal createdAt reason')
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  res.status(200).json({ success: true, sale, invoice, creditNotes, returns });
};

const sendOutcome = (res, outcome, okMessage) =>
  res.status(outcome.ok ? 200 : outcome.httpStatus || 422).json({
    success: outcome.ok,
    message: outcome.ok ? okMessage : outcome.error,
    invoice: outcome.invoice,
  });

const auditOutcome = (req, action, outcome, meta) =>
  audit(req, {
    action,
    entity: 'FiscalInvoice',
    entityId: outcome.invoice?._id,
    after: outcome.invoice
      ? {
          status: outcome.invoice.status,
          provider: outcome.invoice.provider,
          fiscalNumber: outcome.invoice.fiscalNumber,
          lastError: outcome.invoice.lastError,
        }
      : null,
    meta,
  });

// @route POST /api/einvoice/submit/:saleId   (einvoice:view)
const submitSale = async (req, res) => {
  const pharmacy = await loadPharmacy(req);
  const outcome = await einvoice.submitSale({ pharmacy, saleId: req.params.saleId, userId: req.user._id });
  await auditOutcome(req, 'einvoice.submit', outcome, { saleId: req.params.saleId });
  return sendOutcome(res, outcome, 'Invoice processed');
};

// @route POST /api/einvoice/credit-note/:returnId   (einvoice:view)
const issueCreditNote = async (req, res) => {
  const pharmacy = await loadPharmacy(req);
  const outcome = await einvoice.issueCreditNote({ pharmacy, returnId: req.params.returnId, userId: req.user._id });
  await auditOutcome(req, 'einvoice.credit_note', outcome, { returnId: req.params.returnId });
  return sendOutcome(res, outcome, 'Credit note processed');
};

const batchAudit = (req, action, summary, meta = {}) => {
  const { results, ...counts } = summary;
  return audit(req, { action, entity: 'FiscalInvoice', meta: { ...meta, ...counts } });
};

// @route POST /api/einvoice/retry-failed  { limit? }   (einvoice:manage)
const retryFailed = async (req, res) => {
  const pharmacy = await loadPharmacy(req);
  const summary = await einvoice.retryFailed({ pharmacy, userId: req.user._id, limit: req.body?.limit });
  await batchAudit(req, 'einvoice.retry_failed', summary);
  res.status(200).json({ success: true, summary });
};

// @route POST /api/einvoice/submit-pending  { from, to, limit? }   (einvoice:manage)
const submitPending = async (req, res) => {
  const body = req.body || {};
  const from = parseDate(body.from, 'from');
  const to = parseDate(body.to, 'to', true);
  if (!from || !to) throw new AppError('from and to dates are required', 400);
  if (from > to) throw new AppError('from must be before to', 400);
  if (to - from > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw new AppError(`The date range can be at most ${MAX_RANGE_DAYS} days`, 400);
  }
  const pharmacy = await loadPharmacy(req);
  const summary = await einvoice.submitPending({ pharmacy, from, to, userId: req.user._id, limit: body.limit });
  await batchAudit(req, 'einvoice.submit_pending', summary, { from, to });
  res.status(200).json({ success: true, summary });
};

module.exports = {
  getSettings,
  updateSettings,
  listInvoices,
  getInvoice,
  submitSale,
  issueCreditNote,
  retryFailed,
  submitPending,
};
