// Fiscal e-invoicing service (provider-agnostic).
//
//   getSettings(pharmacy)                       -> normalized settings + provider status
//   queueForSale(sale, { session }?)            -> pending FiscalInvoice (or null when disabled)
//   submitSale({ pharmacy, saleId, userId })    -> { invoice, ok, httpStatus, error }
//   issueCreditNote({ pharmacy, returnId, userId }) -> same shape
//   retryFailed({ pharmacy, userId, limit })    -> batch summary
//   submitPending({ pharmacy, from, to, userId, limit }) -> batch summary
//
// Submission is explicit (button / batch). Nothing here runs at sale time unless
// queueForSale() is wired into the sale flow.
const mongoose = require('mongoose');
const AppError = require('../../utils/AppError');
const FiscalInvoice = require('../../models/FiscalInvoice');
const Pharmacy = require('../../models/Pharmacy');
const Sale = require('../../models/Sale');
const Return = require('../../models/Return');
const Customer = require('../../models/Customer');
const { getProvider, listProviders } = require('./providers');
const { buildSalePayload, buildCreditNotePayload, validatePayload } = require('./payload');

const RESUBMITTABLE = ['pending', 'failed', 'rejected', 'not_required'];
const LOCK_MS = 2 * 60 * 1000;
const MAX_BATCH = 200;

const getSettings = (pharmacy) => {
  const e = (pharmacy && pharmacy.einvoice) || {};
  const provider = ['none', 'mock', 'mor'].includes(e.provider) ? e.provider : 'none';
  return {
    enabled: Boolean(e.enabled),
    provider,
    mode: e.mode === 'production' ? 'production' : 'sandbox',
    tin: pharmacy?.tin || '',
    vatRegNo: pharmacy?.vatRegNo || pharmacy?.settings?.tax?.registrationNo || '',
    vatRegistered: Boolean(pharmacy?.vatRegistered),
    providers: listProviders(),
  };
};

// Creates the pending fiscal record for a sale (idempotent). Does not submit.
// Returns null when e-invoicing is disabled for the sale's pharmacy.
const queueForSale = async (sale, { session } = {}) => {
  if (!sale || !sale._id || !sale.pharmacyId) return null;
  const pharmacy = await Pharmacy.findById(sale.pharmacyId).select('einvoice').session(session || null).lean();
  const settings = getSettings(pharmacy);
  if (!settings.enabled || sale.voided) return null;
  return FiscalInvoice.findOneAndUpdate(
    { pharmacyId: sale.pharmacyId, saleId: sale._id, type: 'invoice' },
    {
      $setOnInsert: {
        pharmacyId: sale.pharmacyId,
        saleId: sale._id,
        type: 'invoice',
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: sale.offlineCreatedAt || sale.createdAt || new Date(),
        status: 'pending',
        provider: settings.provider,
        mode: settings.mode,
      },
    },
    { upsert: true, returnDocument: 'after', session }
  );
};

const errorMessage = (err) => {
  if (err && err.isOperational) return err.message;
  console.error('[einvoice] provider error:', err);
  return 'Unexpected error while contacting the e-invoicing provider';
};

// Claims the record, builds + validates the payload, calls the provider and stores the outcome.
const processRecord = async (record, { settings, buildPayload, userId }) => {
  const now = new Date();
  const claimed = await FiscalInvoice.findOneAndUpdate(
    {
      _id: record._id,
      status: { $in: RESUBMITTABLE },
      $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(now.getTime() - LOCK_MS) } }],
    },
    { $set: { lockedAt: now } },
    { returnDocument: 'after' }
  );
  if (!claimed) {
    const current = await FiscalInvoice.findById(record._id);
    if (current && !RESUBMITTABLE.includes(current.status)) {
      return { invoice: current, ok: true, skipped: true, httpStatus: 200 };
    }
    throw new AppError('This document is already being submitted', 409);
  }

  const provider = getProvider(settings.provider);
  const set = { provider: provider.name, mode: settings.mode, lockedAt: null, submittedBy: userId || null };
  let ok = true;
  let httpStatus = 200;
  let error = '';

  let payload = null;
  let problems = [];
  try {
    payload = await buildPayload();
    problems = validatePayload(payload);
  } catch (err) {
    problems = [errorMessage(err)];
  }

  if (provider.name === 'none') {
    Object.assign(set, { status: 'not_required', payload, lastError: '' });
  } else if (problems.length) {
    ok = false;
    httpStatus = 422;
    error = problems.join('; ');
    Object.assign(set, { status: 'failed', payload, lastError: error });
  } else {
    try {
      const result = await provider.submit(payload, { mode: settings.mode });
      const status = ['accepted', 'submitted', 'rejected', 'not_required'].includes(result?.status)
        ? result.status
        : 'failed';
      Object.assign(set, {
        status,
        payload,
        fiscalNumber: result.fiscalNumber || '',
        irn: result.irn || '',
        qrPayload: result.qrPayload || '',
        providerResponse: result.response || null,
        lastError: status === 'rejected' ? String(result.reason || 'Rejected by the provider').slice(0, 1000) : '',
        submittedAt: now,
      });
      if (status === 'accepted') set.acceptedAt = now;
      if (status === 'rejected' || status === 'failed') {
        ok = false;
        httpStatus = 422;
        error = set.lastError || 'Submission failed';
      }
    } catch (err) {
      ok = false;
      httpStatus = err && err.isOperational && err.status >= 500 ? err.status : 502;
      error = errorMessage(err);
      Object.assign(set, { status: 'failed', payload, lastError: error.slice(0, 1000) });
    }
  }

  const invoice = await FiscalInvoice.findByIdAndUpdate(
    record._id,
    { $set: set, $inc: { attempts: 1 } },
    { returnDocument: 'after' }
  );
  return { invoice, ok, httpStatus, error };
};

const assertEnabled = (settings) => {
  if (!settings.enabled) throw new AppError('E-invoicing is not enabled for this pharmacy', 400);
};

const loadCustomer = (pharmacyId, customerId) =>
  customerId ? Customer.findOne({ _id: customerId, pharmacyId }).lean() : null;

const findSale = async (pharmacyId, saleId) => {
  if (!mongoose.isValidObjectId(saleId)) throw new AppError('Invalid sale id', 400);
  const sale = await Sale.findOne({ _id: saleId, pharmacyId });
  if (!sale) throw new AppError('Sale not found', 404);
  return sale;
};

const submitSale = async ({ pharmacy, saleId, userId }) => {
  const settings = getSettings(pharmacy);
  assertEnabled(settings);
  const sale = await findSale(pharmacy._id, saleId);
  if (sale.voided) throw new AppError('Voided sales are not fiscalised', 400);

  const record = await queueForSale(sale);
  if (!RESUBMITTABLE.includes(record.status)) {
    throw new AppError(`This sale was already ${record.status} by the e-invoicing provider`, 409);
  }
  return processRecord(record, {
    settings,
    userId,
    buildPayload: async () =>
      buildSalePayload({ pharmacy, sale, customer: await loadCustomer(pharmacy._id, sale.customerId) }),
  });
};

const issueCreditNote = async ({ pharmacy, returnId, userId }) => {
  const settings = getSettings(pharmacy);
  assertEnabled(settings);
  if (!mongoose.isValidObjectId(returnId)) throw new AppError('Invalid return id', 400);
  const ret = await Return.findOne({ _id: returnId, pharmacyId: pharmacy._id }).lean();
  if (!ret) throw new AppError('Return not found', 404);
  const sale = await findSale(pharmacy._id, ret.saleId);

  const original = await FiscalInvoice.findOne({ pharmacyId: pharmacy._id, saleId: sale._id, type: 'invoice' });
  if (!original || !['accepted', 'submitted', 'not_required'].includes(original.status)) {
    throw new AppError('The original sale must be fiscalised before a credit note can be issued', 400);
  }

  const record = await FiscalInvoice.findOneAndUpdate(
    { pharmacyId: pharmacy._id, returnId: ret._id, type: 'credit_note' },
    {
      $setOnInsert: {
        pharmacyId: pharmacy._id,
        type: 'credit_note',
        saleId: sale._id,
        returnId: ret._id,
        originalInvoiceId: original._id,
        invoiceNumber: ret.returnNumber,
        invoiceDate: ret.createdAt || new Date(),
        status: 'pending',
        provider: settings.provider,
        mode: settings.mode,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  if (!RESUBMITTABLE.includes(record.status)) {
    throw new AppError(`This credit note was already ${record.status} by the e-invoicing provider`, 409);
  }
  return processRecord(record, {
    settings,
    userId,
    buildPayload: async () =>
      buildCreditNotePayload({
        pharmacy,
        sale,
        ret,
        original,
        customer: await loadCustomer(pharmacy._id, sale.customerId),
      }),
  });
};

const emptySummary = () => ({
  processed: 0,
  accepted: 0,
  submitted: 0,
  rejected: 0,
  failed: 0,
  not_required: 0,
  skipped: 0,
  results: [],
});

const tally = (summary, ref, outcome) => {
  summary.processed += 1;
  if (outcome.skipped) summary.skipped += 1;
  const status = outcome.invoice?.status || 'failed';
  if (!outcome.skipped && summary[status] !== undefined) summary[status] += 1;
  summary.results.push({
    ...ref,
    status,
    fiscalNumber: outcome.invoice?.fiscalNumber || '',
    error: outcome.error || '',
  });
};

const runBatch = async (jobs) => {
  const summary = emptySummary();
  for (const job of jobs) {
    try {
      // Sequential on purpose: keeps provider load and rate limits predictable.
      // eslint-disable-next-line no-await-in-loop
      const outcome = await job.run();
      tally(summary, job.ref, outcome);
    } catch (err) {
      tally(summary, job.ref, { invoice: null, error: errorMessage(err) });
    }
  }
  return summary;
};

const clampLimit = (limit, fallback) => {
  const n = Number(limit);
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_BATCH) : fallback;
};

// Re-submits documents whose last attempt failed for technical reasons.
const retryFailed = async ({ pharmacy, userId, limit }) => {
  const settings = getSettings(pharmacy);
  assertEnabled(settings);
  const records = await FiscalInvoice.find({ pharmacyId: pharmacy._id, status: 'failed' })
    .sort({ createdAt: 1 })
    .limit(clampLimit(limit, 100));

  return runBatch(
    records.map((record) => ({
      ref: { saleId: record.saleId, returnId: record.returnId, type: record.type, invoiceNumber: record.invoiceNumber },
      run: async () => {
        if (record.type === 'credit_note') {
          return issueCreditNote({ pharmacy, returnId: record.returnId, userId });
        }
        return submitSale({ pharmacy, saleId: record.saleId, userId });
      },
    }))
  );
};

// Submits every non-voided sale in [from, to] that has no fiscal record yet or is still pending.
const submitPending = async ({ pharmacy, from, to, userId, limit }) => {
  const settings = getSettings(pharmacy);
  assertEnabled(settings);
  const rows = await Sale.aggregate([
    { $match: { pharmacyId: pharmacy._id, voided: { $ne: true }, createdAt: { $gte: from, $lte: to } } },
    { $sort: { createdAt: 1 } },
    {
      $lookup: {
        from: FiscalInvoice.collection.name,
        let: { sid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$saleId', '$$sid'] }, { $eq: ['$type', 'invoice'] }] } } },
          { $project: { status: 1 } },
        ],
        as: 'fiscal',
      },
    },
    { $match: { $or: [{ fiscal: { $size: 0 } }, { 'fiscal.status': 'pending' }] } },
    { $limit: clampLimit(limit, MAX_BATCH) },
    { $project: { _id: 1, invoiceNumber: 1 } },
  ]);

  return runBatch(
    rows.map((row) => ({
      ref: { saleId: row._id, type: 'invoice', invoiceNumber: row.invoiceNumber },
      run: () => submitSale({ pharmacy, saleId: row._id, userId }),
    }))
  );
};

module.exports = {
  RESUBMITTABLE,
  MAX_BATCH,
  getSettings,
  queueForSale,
  submitSale,
  issueCreditNote,
  retryFailed,
  submitPending,
};
