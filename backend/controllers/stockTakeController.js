// Stock take / physical inventory count (#11). Owner: Catalog agent.
//
// Flow: start (snapshot) -> counting (partial saves) -> submitted -> approved | cancelled.
//
// Approval semantics: for every counted line the variance is
//   variance = countedQty - systemQty (systemQty = batch quantity at snapshot time)
// and that DELTA is applied to the batch's CURRENT quantity. Sales, returns or
// stock-ins that happened while the count was running are therefore preserved
// (the count is assumed to have been taken at snapshot time). If applying the
// delta would make a batch negative, approval fails with 409 and nothing is changed.
// Each applied delta is recorded as a 'stock_take' StockMovement (and, for controlled
// medicines, an 'adjust' controlled-register entry). Approval uses bulk writes so even a
// 20,000-line count stays well inside the Atlas 60 s transaction limit.
const mongoose = require('mongoose');
const StockTake = require('../models/StockTake');
const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');
const AppError = require('../utils/AppError');
const StockMovement = require('../models/StockMovement');
const ControlledEntry = require('../models/ControlledEntry');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { audit } = require('../utils/audit');

const MAX_LINES = 20000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const findStockTake = async (req, { session } = {}) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Stock take not found', 404);
  const st = await StockTake.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId }).session(session || null);
  if (!st) throw new AppError('Stock take not found', 404);
  return st;
};

const summarize = (st) => {
  const lines = st.lines || [];
  const counted = lines.filter((l) => l.countedQty !== null && l.countedQty !== undefined);
  const withVariance = counted.filter((l) => l.variance);
  const sum = (arr, f) => round2(arr.reduce((s, l) => s + (Number(f(l)) || 0), 0));
  return {
    totalLines: lines.length,
    countedLines: counted.length,
    uncountedLines: lines.length - counted.length,
    varianceLines: withVariance.length,
    systemQty: sum(lines, (l) => l.systemQty),
    countedQty: sum(counted, (l) => l.countedQty),
    netVarianceQty: sum(withVariance, (l) => l.variance),
    netVarianceValue: sum(withVariance, (l) => l.varianceValue),
    shortageValue: sum(withVariance.filter((l) => l.variance < 0), (l) => l.varianceValue),
    surplusValue: sum(withVariance.filter((l) => l.variance > 0), (l) => l.varianceValue),
  };
};

const serialize = (st, { includeLines = true } = {}) => {
  const obj = st.toObject();
  obj.summary = summarize(st);
  if (!includeLines) delete obj.lines;
  return obj;
};

// @route POST /api/stock-takes  body: { scope: { category? }, notes? }   (stock:take)
// Snapshots every batch with stock (active, including past-expiry, and 'expired').
const startStockTake = async (req, res) => {
  const body = req.body || {};
  const category = typeof body.scope?.category === 'string' ? body.scope.category.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '';

  const session = await mongoose.startSession();
  let stockTake;
  try {
    await session.withTransaction(async () => {
      let medicineFilter = null;
      const medQuery = { pharmacyId: req.pharmacyId };
      if (category) medQuery.category = category;
      const medicines = await Medicine.find(medQuery).select('name category').session(session);
      const medMap = new Map(medicines.map((m) => [String(m._id), m]));
      if (category) medicineFilter = { $in: medicines.map((m) => m._id) };

      const batchQuery = {
        pharmacyId: req.pharmacyId,
        status: { $in: ['active', 'expired'] },
        quantity: { $gt: 0 },
      };
      if (medicineFilter) batchQuery.medicineId = medicineFilter;
      const batches = await StockBatch.find(batchQuery).sort({ medicineId: 1, expiryDate: 1 }).session(session);
      if (!batches.length) throw new AppError('There is no stock to count in this scope', 400);
      if (batches.length > MAX_LINES) throw new AppError('Too many batches; narrow the scope by category', 400);

      const lines = batches.map((b) => {
        const med = medMap.get(String(b.medicineId));
        return {
          batchId: b._id,
          medicineId: b.medicineId,
          medicineName: med ? med.name : '',
          category: med ? med.category : '',
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          unitCost: b.purchasePrice || 0,
          systemQty: b.quantity,
        };
      });
      lines.sort((a, b) => a.medicineName.localeCompare(b.medicineName) || new Date(a.expiryDate) - new Date(b.expiryDate));

      const seq = await nextSequence(req.pharmacyId, 'ST', { session });
      [stockTake] = await StockTake.create(
        [
          {
            pharmacyId: req.pharmacyId,
            number: formatSequence('ST', seq),
            scope: { category },
            notes,
            status: 'counting',
            lines,
            createdBy: req.user?._id,
          },
        ],
        { session }
      );
      await audit(
        req,
        {
          action: 'stock_take.start',
          entity: 'StockTake',
          entityId: stockTake._id,
          meta: { number: stockTake.number, category, lines: lines.length },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return res.status(201).json({ success: true, stockTake: serialize(stockTake) });
};

// @route GET /api/stock-takes?status=&page=&limit=   (stock:take)
const listStockTakes = async (req, res) => {
  const query = { pharmacyId: req.pharmacyId };
  if (typeof req.query.status === 'string' && StockTake.STOCK_TAKE_STATUSES.includes(req.query.status)) {
    query.status = req.query.status;
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [items, total] = await Promise.all([
    StockTake.find(query)
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    StockTake.countDocuments(query),
  ]);
  return res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    stockTakes: items.map((st) => serialize(st, { includeLines: false })),
  });
};

// @route GET /api/stock-takes/:id   (stock:take)
const getStockTake = async (req, res) => {
  const st = await findStockTake(req);
  await st.populate([
    { path: 'createdBy', select: 'name' },
    { path: 'submittedBy', select: 'name' },
    { path: 'approvedBy', select: 'name' },
  ]);
  return res.status(200).json({ success: true, stockTake: serialize(st) });
};

// @route GET /api/stock-takes/:id/variance   (stock:take) — only lines with a variance
const getVarianceReport = async (req, res) => {
  const st = await findStockTake(req);
  const lines = st.lines
    .filter((l) => l.countedQty !== null && l.variance)
    .sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue));
  return res.status(200).json({
    success: true,
    number: st.number,
    status: st.status,
    summary: summarize(st),
    lines,
  });
};

// @route PATCH /api/stock-takes/:id/counts  body: { counts: [{ lineId | batchId, countedQty|null }] }
// Partial saves are allowed while the stock take is 'counting'.
const saveCounts = async (req, res) => {
  const counts = req.body?.counts;
  if (!Array.isArray(counts) || !counts.length) throw new AppError('Please provide counts', 400);
  if (counts.length > MAX_LINES) throw new AppError('Too many counts in one request', 400);

  const st = await findStockTake(req);
  if (st.status !== 'counting') throw new AppError('Counts can only be entered while counting', 409);

  const byLine = new Map(st.lines.map((l) => [String(l._id), l]));
  const byBatch = new Map(st.lines.map((l) => [String(l.batchId), l]));
  let updated = 0;
  counts.forEach((c, i) => {
    const line = (c.lineId && byLine.get(String(c.lineId))) || (c.batchId && byBatch.get(String(c.batchId)));
    if (!line) throw new AppError(`Count #${i + 1}: line not found in this stock take`, 400);
    if (c.countedQty === null || c.countedQty === '' || c.countedQty === undefined) {
      line.countedQty = null;
      line.variance = null;
      line.varianceValue = null;
    } else {
      const q = Number(c.countedQty);
      if (!Number.isInteger(q) || q < 0) {
        throw new AppError(`Count for batch ${line.batchNo} must be a whole number of 0 or more`, 400);
      }
      line.countedQty = q;
      line.variance = q - line.systemQty;
      line.varianceValue = round2(line.variance * (line.unitCost || 0));
    }
    updated += 1;
  });
  await st.save();
  return res.status(200).json({ success: true, updated, stockTake: serialize(st) });
};

// @route POST /api/stock-takes/:id/submit   (stock:take)
const submitStockTake = async (req, res) => {
  const st = await findStockTake(req);
  if (st.status !== 'counting') throw new AppError('Only a stock take in counting can be submitted', 409);
  if (!st.lines.some((l) => l.countedQty !== null && l.countedQty !== undefined)) {
    throw new AppError('Enter at least one count before submitting', 400);
  }
  st.status = 'submitted';
  st.submittedBy = req.user?._id;
  st.submittedAt = new Date();
  await st.save();
  await audit(req, {
    action: 'stock_take.submit',
    entity: 'StockTake',
    entityId: st._id,
    meta: { number: st.number, summary: summarize(st) },
  });
  return res.status(200).json({ success: true, stockTake: serialize(st) });
};

// @route POST /api/stock-takes/:id/reopen   (stock:take) submitted -> counting
const reopenStockTake = async (req, res) => {
  const st = await findStockTake(req);
  if (st.status !== 'submitted') throw new AppError('Only a submitted stock take can be reopened', 409);
  st.status = 'counting';
  await st.save();
  return res.status(200).json({ success: true, stockTake: serialize(st) });
};

// Batch status after its quantity changed (same rule as a single adjustment).
const statusAfter = (status, quantity) => {
  if (quantity === 0 && status === 'active') return 'depleted';
  if (quantity > 0 && status === 'depleted') return 'active';
  return status;
};

// Units of a batch that count towards a controlled-drug register balance
// (same rule as services/clinical currentStock: active/expired batches with stock).
const registerUnits = ({ status, quantity }) => (['active', 'expired'].includes(status) && quantity > 0 ? quantity : 0);

// Applies every counted variance of a stock take inside the caller's transaction using a
// constant number of round trips (a stock take can have up to MAX_LINES lines and an Atlas
// transaction must finish within 60 s):
//   1. one read of the affected batches (validates nothing goes negative, gives balances)
//   2. one bulkWrite of conditional $inc updates (quantity >= needed), verified by modifiedCount
//   3. one insertMany of StockMovements, and for controlled medicines one lookup, one balance
//      aggregate and one insertMany of ControlledEntry rows
// Sets line.appliedChange on every line (null = not counted, 0 = no variance).
const applyStockTakeVariances = async (req, st, session) => {
  const pharmacyId = new mongoose.Types.ObjectId(String(req.pharmacyId));
  const userId = req.user?._id || null;

  const changed = [];
  const netByBatch = new Map();
  for (const line of st.lines) {
    if (line.countedQty === null || line.countedQty === undefined) {
      line.appliedChange = null;
    } else if (!line.variance) {
      line.appliedChange = 0;
    } else {
      changed.push(line);
      const key = String(line.batchId);
      netByBatch.set(key, (netByBatch.get(key) || 0) + line.variance);
    }
  }
  if (!changed.length) return;

  // 1. Current state of every affected batch (read inside the transaction snapshot).
  const batches = await StockBatch.find({ _id: { $in: [...netByBatch.keys()] }, pharmacyId })
    .select('quantity status medicineId')
    .session(session)
    .lean();
  const batchById = new Map(batches.map((b) => [String(b._id), b]));
  for (const line of changed) {
    const b = batchById.get(String(line.batchId));
    if (!b || b.quantity + netByBatch.get(String(line.batchId)) < 0) {
      throw new AppError(
        `Batch ${line.batchNo} (${line.medicineName}) changed since the count started and the correction would make it negative. Reopen and recount it.`,
        409
      );
    }
  }

  // 2. One bulkWrite; the filter still refuses to take a batch below zero.
  const ops = [];
  netByBatch.forEach((delta, key) => {
    if (!delta) return;
    const b = batchById.get(key);
    const update = { $inc: { quantity: delta } };
    const nextStatus = statusAfter(b.status, b.quantity + delta);
    if (nextStatus !== b.status) update.$set = { status: nextStatus };
    ops.push({
      updateOne: {
        filter: { _id: b._id, pharmacyId, quantity: { $gte: Math.max(0, -delta) } },
        update,
      },
    });
  });
  if (ops.length) {
    const result = await StockBatch.bulkWrite(ops, { session, ordered: true });
    if (result.modifiedCount !== ops.length) {
      throw new AppError(
        'Stock changed while the stock take was being approved and a correction would make a batch negative. Reopen and recount, then approve again.',
        409
      );
    }
  }

  // 3. Movement ledger + controlled register, built in line order with running balances.
  const state = new Map(batches.map((b) => [String(b._id), { quantity: b.quantity, status: b.status }]));
  const reason = (line) => `Stock take ${st.number}: counted ${line.countedQty}, system ${line.systemQty}`;
  const movements = [];
  const steps = []; // { line, batch, delta, registerChange }
  for (const line of changed) {
    const key = String(line.batchId);
    const batch = batchById.get(key);
    const before = state.get(key);
    const delta = line.variance;
    const after = { quantity: before.quantity + delta, status: statusAfter(before.status, before.quantity + delta) };
    state.set(key, after);
    // Same document recordMovement() writes (utils/stockMovement.js)
    movements.push({
      pharmacyId,
      batchId: batch._id,
      medicineId: batch.medicineId,
      type: 'stock_take',
      quantityChange: delta,
      balanceAfter: after.quantity,
      reason: reason(line),
      userId: userId || undefined,
      refId: st._id,
      refModel: 'StockTake',
    });
    steps.push({ batch, delta, registerChange: registerUnits(after) - registerUnits(before) });
    line.appliedChange = delta;
  }
  await StockMovement.insertMany(movements, { session });

  const medIds = [...new Set(steps.map((s) => String(s.batch.medicineId)))];
  const controlled = await Medicine.find({ _id: { $in: medIds }, pharmacyId, isControlled: true })
    .select('_id')
    .session(session)
    .lean();
  if (!controlled.length) return;
  const controlledIds = new Set(controlled.map((m) => String(m._id)));

  // Register balance after the whole stock take, per controlled medicine ...
  const totals = await StockBatch.aggregate([
    {
      $match: {
        pharmacyId,
        medicineId: { $in: controlled.map((m) => m._id) },
        status: { $in: ['active', 'expired'] },
        quantity: { $gt: 0 },
      },
    },
    { $group: { _id: '$medicineId', total: { $sum: '$quantity' } } },
  ]).session(session);
  const finalByMed = new Map(totals.map((r) => [String(r._id), r.total]));
  // ... walked back to the balance before the first line, then forward line by line, so each
  // entry carries the balance right after its own correction (as one-by-one recording would).
  const running = new Map();
  [...controlledIds].forEach((id) => {
    const changeSum = steps
      .filter((s) => String(s.batch.medicineId) === id)
      .reduce((sum, s) => sum + s.registerChange, 0);
    running.set(id, (finalByMed.get(id) || 0) - changeSum);
  });
  const now = new Date();
  const entries = [];
  steps.forEach(({ batch, delta, registerChange }) => {
    const medId = String(batch.medicineId);
    if (!controlledIds.has(medId)) return;
    const balanceAfter = running.get(medId) + registerChange;
    running.set(medId, balanceAfter);
    // Same document recordControlledMovement() writes (services/clinical.js), entryType 'adjust'
    entries.push({
      pharmacyId,
      medicineId: batch.medicineId,
      batchId: batch._id,
      saleId: null,
      patientId: null,
      prescriptionId: null,
      quantityIn: delta > 0 ? delta : 0,
      quantityOut: delta < 0 ? -delta : 0,
      balanceAfter,
      userId,
      entryType: 'adjust',
      refId: st._id,
      notes: `Stock take ${st.number}`,
      date: now,
    });
  });
  if (entries.length) await ControlledEntry.insertMany(entries, { session });
};

// @route POST /api/stock-takes/:id/approve   (stock:take + stock:adjust)
const approveStockTake = async (req, res) => {
  const session = await mongoose.startSession();
  let st;
  try {
    await session.withTransaction(async () => {
      st = await findStockTake(req, { session });
      if (st.status !== 'submitted') throw new AppError('Only a submitted stock take can be approved', 409);

      await applyStockTakeVariances(req, st, session);

      st.status = 'approved';
      st.approvedBy = req.user?._id;
      st.approvedAt = new Date();
      await st.save({ session });
      await audit(
        req,
        {
          action: 'stock_take.approve',
          entity: 'StockTake',
          entityId: st._id,
          meta: { number: st.number, summary: summarize(st) },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  return res.status(200).json({ success: true, message: 'Stock take approved and stock corrected', stockTake: serialize(st) });
};

// @route POST /api/stock-takes/:id/cancel   (stock:take)
const cancelStockTake = async (req, res) => {
  const st = await findStockTake(req);
  if (!['draft', 'counting', 'submitted'].includes(st.status)) {
    throw new AppError('This stock take can no longer be cancelled', 409);
  }
  st.status = 'cancelled';
  st.cancelledBy = req.user?._id;
  st.cancelledAt = new Date();
  await st.save();
  await audit(req, { action: 'stock_take.cancel', entity: 'StockTake', entityId: st._id, meta: { number: st.number } });
  return res.status(200).json({ success: true, stockTake: serialize(st, { includeLines: false }) });
};

module.exports = {
  startStockTake,
  listStockTakes,
  getStockTake,
  getVarianceReport,
  saveCounts,
  submitStockTake,
  reopenStockTake,
  approveStockTake,
  cancelStockTake,
};
