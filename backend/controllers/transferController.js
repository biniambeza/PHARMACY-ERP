const mongoose = require('mongoose');
const Transfer = require('../models/Transfer');
const Pharmacy = require('../models/Pharmacy');
const Organization = require('../models/Organization');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { recordMovement } = require('../utils/stockMovement');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { audit } = require('../utils/audit');
const { sameId } = require('../utils/membership');

const MAX_LINES = 200;
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const sameDay = (a, b) => a && b && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// ----- helpers ---------------------------------------------------------------

// Validates and normalizes request lines: [{ medicineId, batchId?, quantity }]
const parseLines = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError('Add at least one medicine to the transfer', 400);
  }
  if (lines.length > MAX_LINES) throw new AppError(`A transfer can have at most ${MAX_LINES} lines`, 400);
  return lines.map((l, i) => {
    const quantity = Number(l && l.quantity);
    if (!l || !isId(String(l.medicineId || ''))) throw new AppError(`Line ${i + 1}: invalid medicine`, 400);
    if (l.batchId && !isId(String(l.batchId))) throw new AppError(`Line ${i + 1}: invalid batch`, 400);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new AppError(`Line ${i + 1}: quantity must be a whole number of at least 1`, 400);
    }
    return { medicineId: String(l.medicineId), batchId: l.batchId ? String(l.batchId) : null, quantity };
  });
};

// Source pharmacy must belong to an organization and the destination must be
// another active branch of the same organization.
const resolveDestination = async (source, toPharmacyId, { session } = {}) => {
  if (!isId(String(toPharmacyId || ''))) throw new AppError('Please choose a destination branch', 400);
  if (sameId(source._id, toPharmacyId)) throw new AppError('Source and destination must be different branches', 400);
  if (!source.organizationId) {
    throw new AppError('This pharmacy is not part of an organization; create a branch first', 400);
  }
  const dest = await Pharmacy.findById(toPharmacyId).session(session || null);
  if (!dest || !dest.organizationId || !sameId(dest.organizationId, source.organizationId)) {
    throw new AppError('Destination branch must belong to the same organization', 403);
  }
  if (dest.status !== 'active') throw new AppError('Destination branch is not active', 400);
  return dest;
};

const decBatch = async (batch, qty, session) => {
  const now = new Date();
  const updated = await StockBatch.findOneAndUpdate(
    {
      _id: batch._id,
      pharmacyId: batch.pharmacyId,
      status: 'active',
      quantity: { $gte: qty },
      expiryDate: { $gt: now },
    },
    { $inc: { quantity: -qty } },
    { returnDocument: 'after', session }
  );
  if (!updated) return null;
  if (updated.quantity === 0) {
    await StockBatch.updateOne({ _id: updated._id }, { $set: { status: 'depleted' } }, { session });
    updated.status = 'depleted';
  }
  return updated;
};

// Deducts the requested lines from the source pharmacy (inside `session`):
// a given batch, or FEFO across non-expired active batches. Returns the
// allocated transfer lines (one per source batch).
const allocateAndDeduct = async ({ transfer, requested, pharmacyId, userId, session }) => {
  const allocated = [];
  const now = new Date();
  const medicineIds = [...new Set(requested.map((l) => String(l.medicineId)))];
  const medicines = await Medicine.find({ _id: { $in: medicineIds }, pharmacyId }).session(session);
  const medById = new Map(medicines.map((m) => [String(m._id), m]));

  for (const line of requested) {
    const medicine = medById.get(String(line.medicineId));
    if (!medicine) throw new AppError('Medicine not found in this branch', 404);

    const pushLine = async (batch, qty, updated) => {
      allocated.push({
        medicineId: medicine._id,
        medicineName: medicine.name,
        batchId: batch._id,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate,
        quantity: qty,
        unitCost: batch.purchasePrice || medicine.costPrice || 0,
      });
      await recordMovement(
        {
          pharmacyId,
          batchId: batch._id,
          medicineId: medicine._id,
          type: 'transfer_out',
          quantityChange: -qty,
          balanceAfter: updated.quantity,
          reason: `Transfer ${transfer.number} sent`,
          userId,
          refId: transfer._id,
          refModel: 'Transfer',
        },
        { session }
      );
    };

    if (line.batchId) {
      const batch = await StockBatch.findOne({
        _id: line.batchId,
        pharmacyId,
        medicineId: medicine._id,
      }).session(session);
      if (!batch) throw new AppError(`Batch not found for ${medicine.name}`, 404);
      const updated = await decBatch(batch, line.quantity, session);
      if (!updated) {
        throw new AppError(
          `Not enough usable stock in batch ${batch.batchNo} of ${medicine.name} (expired or insufficient)`,
          409
        );
      }
      await pushLine(batch, line.quantity, updated);
      continue;
    }

    // FEFO across non-expired active batches
    const batches = await StockBatch.find({
      pharmacyId,
      medicineId: medicine._id,
      status: 'active',
      quantity: { $gt: 0 },
      expiryDate: { $gt: now },
    })
      .sort({ expiryDate: 1, createdAt: 1 })
      .session(session);
    const available = batches.reduce((s, b) => s + b.quantity, 0);
    if (available < line.quantity) {
      throw new AppError(
        `Insufficient stock for ${medicine.name}: ${available} available, ${line.quantity} requested`,
        409
      );
    }
    let remaining = line.quantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      const updated = await decBatch(batch, take, session);
      if (!updated) throw new AppError(`Stock for ${medicine.name} changed, please try again`, 409);
      await pushLine(batch, take, updated);
      remaining -= take;
    }
  }
  return allocated;
};

const runTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const populateTransfer = (query) =>
  query
    .populate('fromPharmacyId', 'name address')
    .populate('toPharmacyId', 'name address')
    .populate('createdBy', 'name')
    .populate('receivedBy', 'name')
    .populate('cancelledBy', 'name');

// ----- endpoints -------------------------------------------------------------

// @desc    Other active branches of the current pharmacy's organization
// @route   GET /api/transfers/destinations
// @access  transfer:manage
const getDestinations = async (req, res) => {
  const pharmacy = req.pharmacy || (await Pharmacy.findById(req.pharmacyId));
  if (!pharmacy || !pharmacy.organizationId) {
    return res.status(200).json({ success: true, organizationId: null, branches: [] });
  }
  const branches = await Pharmacy.find({
    organizationId: pharmacy.organizationId,
    _id: { $ne: pharmacy._id },
    status: 'active',
  })
    .select('name address phone status')
    .sort({ name: 1 })
    .lean();
  return res.status(200).json({ success: true, organizationId: pharmacy.organizationId, branches });
};

// @desc    List transfers of the current branch
// @route   GET /api/transfers?direction=outgoing|incoming|all&status=&page=&limit=
// @access  transfer:manage
const listTransfers = async (req, res) => {
  const direction = ['outgoing', 'incoming'].includes(req.query.direction) ? req.query.direction : 'all';
  const filter = {};
  if (direction === 'outgoing') filter.fromPharmacyId = req.pharmacyId;
  else if (direction === 'incoming') {
    filter.toPharmacyId = req.pharmacyId;
    // Drafts are private to the source branch
    filter.status = { $ne: 'draft' };
  } else {
    filter.$or = [
      { fromPharmacyId: req.pharmacyId },
      { toPharmacyId: req.pharmacyId, status: { $ne: 'draft' } },
    ];
  }
  const statuses = ['draft', 'in_transit', 'received', 'cancelled'];
  if (typeof req.query.status === 'string' && statuses.includes(req.query.status)) {
    if (direction === 'incoming' && req.query.status === 'draft') {
      return res.status(200).json({ success: true, total: 0, page: 1, pages: 1, transfers: [] });
    }
    if (filter.$or) filter.$and = [{ status: req.query.status }];
    else filter.status = req.query.status;
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const [transfers, total] = await Promise.all([
    populateTransfer(Transfer.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
    Transfer.countDocuments(filter),
  ]);
  return res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit) || 1, transfers });
};

// @desc    One transfer (source or destination branch)
// @route   GET /api/transfers/:id
// @access  transfer:manage
const getTransfer = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const transfer = await populateTransfer(
    Transfer.findOne({
      _id: req.params.id,
      $or: [{ fromPharmacyId: req.pharmacyId }, { toPharmacyId: req.pharmacyId, status: { $ne: 'draft' } }],
    })
  ).lean();
  if (!transfer) throw new AppError('Transfer not found', 404);
  return res.status(200).json({ success: true, transfer });
};

// @desc    Create a transfer from the current branch. Sent immediately unless
//          `draft: true` (stock is deducted only when sent).
// @route   POST /api/transfers  { toPharmacyId, lines: [{ medicineId, batchId?, quantity }], notes?, draft? }
// @access  transfer:manage (in the source branch)
const createTransfer = async (req, res) => {
  const { toPharmacyId, notes, draft } = req.body || {};
  const requested = parseLines(req.body && req.body.lines);
  const source = req.pharmacy;
  const dest = await resolveDestination(source, toPharmacyId);
  const asDraft = draft === true;

  const transfer = await runTransaction(async (session) => {
    const seq = await nextSequence(source._id, 'TRF', { session });
    const doc = new Transfer({
      organizationId: source.organizationId,
      number: formatSequence('TRF', seq),
      fromPharmacyId: source._id,
      toPharmacyId: dest._id,
      status: asDraft ? 'draft' : 'in_transit',
      createdBy: req.user._id,
      notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : '',
      lines: [],
    });

    if (asDraft) {
      const meds = await Medicine.find({
        _id: { $in: requested.map((l) => l.medicineId) },
        pharmacyId: source._id,
      })
        .select('name')
        .session(session);
      const byId = new Map(meds.map((m) => [String(m._id), m]));
      doc.lines = requested.map((l) => {
        const m = byId.get(l.medicineId);
        if (!m) throw new AppError('Medicine not found in this branch', 404);
        return { medicineId: m._id, medicineName: m.name, batchId: l.batchId, quantity: l.quantity };
      });
    } else {
      doc.lines = await allocateAndDeduct({
        transfer: doc,
        requested,
        pharmacyId: source._id,
        userId: req.user._id,
        session,
      });
      doc.sentAt = new Date();
    }
    await doc.save({ session });
    await audit(
      req,
      {
        action: asDraft ? 'transfer.create' : 'transfer.send',
        entity: 'Transfer',
        entityId: doc._id,
        after: doc,
        meta: { number: doc.number, toPharmacyId: dest._id },
      },
      { session }
    );
    return doc;
  });

  return res.status(201).json({
    success: true,
    message: asDraft ? 'Transfer saved as draft' : 'Transfer sent',
    transfer,
  });
};

// @desc    Send a draft transfer (deducts stock at the source)
// @route   POST /api/transfers/:id/send
// @access  transfer:manage (in the source branch)
const sendTransfer = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const source = req.pharmacy;

  const transfer = await runTransaction(async (session) => {
    // Atomic claim draft -> in_transit
    const doc = await Transfer.findOneAndUpdate(
      { _id: req.params.id, fromPharmacyId: source._id, status: 'draft' },
      { $set: { status: 'in_transit', sentAt: new Date() } },
      { returnDocument: 'after', session }
    );
    if (!doc) {
      const exists = await Transfer.exists({ _id: req.params.id, fromPharmacyId: source._id }).session(session);
      throw new AppError(exists ? 'Only draft transfers can be sent' : 'Transfer not found', exists ? 409 : 404);
    }
    await resolveDestination(source, doc.toPharmacyId, { session });
    const requested = doc.lines.map((l) => ({
      medicineId: String(l.medicineId),
      batchId: l.batchId ? String(l.batchId) : null,
      quantity: l.quantity,
    }));
    doc.lines = await allocateAndDeduct({
      transfer: doc,
      requested,
      pharmacyId: source._id,
      userId: req.user._id,
      session,
    });
    await doc.save({ session });
    await audit(
      req,
      { action: 'transfer.send', entity: 'Transfer', entityId: doc._id, after: doc, meta: { number: doc.number } },
      { session }
    );
    return doc;
  });

  return res.status(200).json({ success: true, message: 'Transfer sent', transfer });
};

// Finds the destination medicine by name (case-insensitive) or creates a copy
// of the source medicine in the destination catalog.
const destinationMedicine = async ({ line, toPharmacyId, session, cache }) => {
  const key = String(line.medicineId);
  if (cache.has(key)) return cache.get(key);

  const name = (line.medicineName || '').trim();
  let med = await Medicine.findOne({
    pharmacyId: toPharmacyId,
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  }).session(session);

  if (!med) {
    const src = await Medicine.findById(line.medicineId).session(session);
    const base = src ? src.toObject() : { name, category: 'General', price: line.unitCost || 0 };
    let barcode = base.barcode;
    if (barcode && (await Medicine.exists({ pharmacyId: toPharmacyId, barcode }).session(session))) {
      barcode = undefined;
    }
    [med] = await Medicine.create(
      [
        {
          pharmacyId: toPharmacyId,
          name: base.name || name,
          genericName: base.genericName || '',
          category: base.category || 'General',
          dosageForm: base.dosageForm,
          strength: base.strength || '',
          price: base.price || 0,
          costPrice: base.costPrice || line.unitCost || 0,
          minStockLevel: base.minStockLevel,
          requiresPrescription: Boolean(base.requiresPrescription),
          barcode,
          sku: base.sku || '',
          baseUnit: base.baseUnit || 'unit',
          // Pack barcodes are dropped: they may clash with the destination catalog
          packUnits: (base.packUnits || []).map((p) => ({ name: p.name, factor: p.factor, price: p.price })),
          taxExempt: Boolean(base.taxExempt),
          isControlled: Boolean(base.isControlled),
          controlledSchedule: base.controlledSchedule || '',
          minMarginPercent: base.minMarginPercent ?? null,
        },
      ],
      { session }
    );
  }
  cache.set(key, med);
  return med;
};

// Adds `qty` to the destination batch with the same batchNo/expiry (merged),
// or creates a new batch. A batchNo already used with another expiry gets a
// suffix (batchNo is unique per medicine).
const addToDestinationBatch = async ({ line, medicine, toPharmacyId, transferNumber, session }) => {
  const existing = await StockBatch.findOne({
    pharmacyId: toPharmacyId,
    medicineId: medicine._id,
    batchNo: line.batchNo,
  }).session(session);

  if (existing && sameDay(existing.expiryDate, line.expiryDate)) {
    const updated = await StockBatch.findOneAndUpdate(
      { _id: existing._id },
      {
        $inc: { quantity: line.quantity },
        $set: { status: existing.status === 'depleted' ? 'active' : existing.status },
      },
      { returnDocument: 'after', session }
    );
    return updated;
  }

  const batchNo = existing ? `${line.batchNo}-${transferNumber}` : line.batchNo;
  const [created] = await StockBatch.create(
    [
      {
        pharmacyId: toPharmacyId,
        medicineId: medicine._id,
        batchNo,
        quantity: line.quantity,
        initialQuantity: line.quantity,
        expiryDate: line.expiryDate,
        purchasePrice: line.unitCost || 0,
      },
    ],
    { session }
  );
  return created;
};

// @desc    Receive an in-transit transfer into the current (destination) branch
// @route   POST /api/transfers/:id/receive
// @access  transfer:manage (in the destination branch)
const receiveTransfer = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const toPharmacyId = req.pharmacyId;

  const transfer = await runTransaction(async (session) => {
    // Atomic claim: only one receive can win
    const doc = await Transfer.findOneAndUpdate(
      { _id: req.params.id, toPharmacyId, status: 'in_transit' },
      { $set: { status: 'received', receivedBy: req.user._id, receivedAt: new Date() } },
      { returnDocument: 'after', session }
    );
    if (!doc) {
      const existing = await Transfer.findOne({ _id: req.params.id, toPharmacyId }).select('status').session(session);
      if (!existing || existing.status === 'draft') throw new AppError('Transfer not found', 404);
      throw new AppError(`Transfer is already ${existing.status.replace('_', ' ')}`, 409);
    }

    const cache = new Map();
    for (const line of doc.lines) {
      const medicine = await destinationMedicine({ line, toPharmacyId, session, cache });
      const batch = await addToDestinationBatch({
        line,
        medicine,
        toPharmacyId,
        transferNumber: doc.number,
        session,
      });
      line.destMedicineId = medicine._id;
      line.destBatchId = batch._id;
      await recordMovement(
        {
          pharmacyId: toPharmacyId,
          batchId: batch._id,
          medicineId: medicine._id,
          type: 'transfer_in',
          quantityChange: line.quantity,
          balanceAfter: batch.quantity,
          reason: `Transfer ${doc.number} received`,
          userId: req.user._id,
          refId: doc._id,
          refModel: 'Transfer',
        },
        { session }
      );
    }
    await doc.save({ session });
    await audit(
      req,
      { action: 'transfer.receive', entity: 'Transfer', entityId: doc._id, after: doc, meta: { number: doc.number } },
      { session }
    );
    return doc;
  });

  return res.status(200).json({ success: true, message: 'Transfer received', transfer });
};

// @desc    Cancel a draft or in-transit transfer. In-transit stock goes back to
//          the source batches. Allowed from the source or the destination branch
//          (destination = reject); drafts only from the source.
// @route   POST /api/transfers/:id/cancel  { reason? }
// @access  transfer:manage
const cancelTransfer = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const pid = req.pharmacyId;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';

  const transfer = await runTransaction(async (session) => {
    const doc = await Transfer.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { fromPharmacyId: pid, status: { $in: ['draft', 'in_transit'] } },
          { toPharmacyId: pid, status: 'in_transit' },
        ],
      },
      { $set: { status: 'cancelled', cancelledBy: req.user._id, cancelledAt: new Date() } },
      { returnDocument: 'before', session }
    );
    if (!doc) {
      const existing = await Transfer.findOne({
        _id: req.params.id,
        $or: [{ fromPharmacyId: pid }, { toPharmacyId: pid, status: { $ne: 'draft' } }],
      })
        .select('status')
        .session(session);
      if (!existing) throw new AppError('Transfer not found', 404);
      throw new AppError(`Transfer is already ${existing.status.replace('_', ' ')}`, 409);
    }

    const wasInTransit = doc.status === 'in_transit';
    if (wasInTransit) {
      for (const line of doc.lines) {
        let batch = line.batchId
          ? await StockBatch.findOneAndUpdate(
              { _id: line.batchId, pharmacyId: doc.fromPharmacyId },
              { $inc: { quantity: line.quantity } },
              { returnDocument: 'after', session }
            )
          : null;
        if (batch && batch.status === 'depleted' && batch.quantity > 0) {
          await StockBatch.updateOne({ _id: batch._id }, { $set: { status: 'active' } }, { session });
        }
        if (!batch) {
          // Source batch was removed meanwhile: recreate it
          [batch] = await StockBatch.create(
            [
              {
                pharmacyId: doc.fromPharmacyId,
                medicineId: line.medicineId,
                batchNo: `${line.batchNo || 'TRF'}-${doc.number}`,
                quantity: line.quantity,
                initialQuantity: line.quantity,
                expiryDate: line.expiryDate || new Date(),
                purchasePrice: line.unitCost || 0,
              },
            ],
            { session }
          );
        }
        await recordMovement(
          {
            pharmacyId: doc.fromPharmacyId,
            batchId: batch._id,
            medicineId: line.medicineId,
            type: 'transfer_in',
            quantityChange: line.quantity,
            balanceAfter: batch.quantity,
            reason: `Transfer ${doc.number} cancelled, stock returned${reason ? `: ${reason}` : ''}`,
            userId: req.user._id,
            refId: doc._id,
            refModel: 'Transfer',
          },
          { session }
        );
      }
    }
    if (reason) {
      await Transfer.updateOne(
        { _id: doc._id },
        { $set: { notes: `${doc.notes ? `${doc.notes}\n` : ''}Cancelled: ${reason}`.slice(0, 1000) } },
        { session }
      );
    }
    await audit(
      req,
      {
        action: 'transfer.cancel',
        entity: 'Transfer',
        entityId: doc._id,
        before: doc,
        meta: { number: doc.number, stockReturned: wasInTransit, reason },
      },
      { session }
    );
    return Transfer.findById(doc._id).session(session);
  });

  return res.status(200).json({ success: true, message: 'Transfer cancelled', transfer });
};

// @desc    Consolidated figures for every branch of the organization:
//          sales totals, stock value and low-stock count per branch + total.
// @route   GET /api/transfers/consolidated?from=&to=
// @access  Organization owner (or the owner of a single pharmacy); admins in support mode
const getConsolidated = async (req, res) => {
  const pharmacy = req.pharmacy || (await Pharmacy.findById(req.pharmacyId));
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);

  let branches;
  let organization = null;
  if (pharmacy.organizationId) {
    organization = await Organization.findById(pharmacy.organizationId).lean();
  }
  const isAdmin = req.user.role === 'admin';
  if (organization) {
    if (!isAdmin && !sameId(organization.ownerId, req.user._id)) {
      throw new AppError('Only the organization owner can view consolidated reports', 403);
    }
    branches = await Pharmacy.find({ organizationId: organization._id, status: { $ne: 'archived' } })
      .select('name address status')
      .sort({ name: 1 })
      .lean();
  } else {
    if (!isAdmin && req.membershipRole !== 'owner') {
      throw new AppError('Only the owner can view consolidated reports', 403);
    }
    branches = [{ _id: pharmacy._id, name: pharmacy.name, address: pharmacy.address, status: pharmacy.status }];
  }

  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new AppError('Invalid date range', 400);
  if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);

  const ids = branches.map((b) => b._id);
  const now = new Date();

  const [salesRows, stockRows, lowRows] = await Promise.all([
    Sale.aggregate([
      { $match: { pharmacyId: { $in: ids }, createdAt: { $gte: from, $lte: to }, voided: { $ne: true } } },
      { $group: { _id: '$pharmacyId', salesTotal: { $sum: '$grandTotal' }, salesCount: { $sum: 1 } } },
    ]),
    StockBatch.aggregate([
      { $match: { pharmacyId: { $in: ids }, status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
      {
        $group: {
          _id: '$pharmacyId',
          stockValue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
          units: { $sum: '$quantity' },
        },
      },
    ]),
    // Mirrors the dashboard: low = 0 < sellable qty <= (minStockLevel || 10)
    Medicine.aggregate([
      { $match: { pharmacyId: { $in: ids }, isArchived: { $ne: true } } },
      { $project: { pharmacyId: 1, minStockLevel: 1 } },
      {
        $lookup: {
          from: StockBatch.collection.name,
          localField: '_id',
          foreignField: 'medicineId',
          pipeline: [
            { $match: { status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
            { $group: { _id: null, qty: { $sum: '$quantity' } } },
          ],
          as: 'stock',
        },
      },
      {
        $project: {
          pharmacyId: 1,
          qty: { $ifNull: [{ $first: '$stock.qty' }, 0] },
          minLevel: { $cond: [{ $in: [{ $ifNull: ['$minStockLevel', 0] }, [0]] }, 10, '$minStockLevel'] },
        },
      },
      {
        $group: {
          _id: '$pharmacyId',
          lowStockCount: {
            $sum: { $cond: [{ $and: [{ $gt: ['$qty', 0] }, { $lte: ['$qty', '$minLevel'] }] }, 1, 0] },
          },
          outOfStockCount: { $sum: { $cond: [{ $lte: ['$qty', 0] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const map = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const salesMap = map(salesRows);
  const stockMap = map(stockRows);
  const lowMap = map(lowRows);
  const round = (n) => Math.round((n || 0) * 100) / 100;

  const rows = branches.map((b) => {
    const s = salesMap.get(String(b._id)) || {};
    const st = stockMap.get(String(b._id)) || {};
    const lo = lowMap.get(String(b._id)) || {};
    return {
      pharmacyId: b._id,
      name: b.name,
      address: b.address,
      status: b.status,
      salesTotal: round(s.salesTotal),
      salesCount: s.salesCount || 0,
      stockValue: round(st.stockValue),
      stockUnits: st.units || 0,
      lowStockCount: lo.lowStockCount || 0,
      outOfStockCount: lo.outOfStockCount || 0,
    };
  });
  const total = rows.reduce(
    (acc, r) => ({
      salesTotal: round(acc.salesTotal + r.salesTotal),
      salesCount: acc.salesCount + r.salesCount,
      stockValue: round(acc.stockValue + r.stockValue),
      stockUnits: acc.stockUnits + r.stockUnits,
      lowStockCount: acc.lowStockCount + r.lowStockCount,
      outOfStockCount: acc.outOfStockCount + r.outOfStockCount,
    }),
    { salesTotal: 0, salesCount: 0, stockValue: 0, stockUnits: 0, lowStockCount: 0, outOfStockCount: 0 }
  );

  return res.status(200).json({
    success: true,
    organization: organization ? { _id: organization._id, name: organization.name } : null,
    from,
    to,
    branches: rows,
    total,
  });
};

module.exports = {
  getDestinations,
  listTransfers,
  getTransfer,
  createTransfer,
  sendTransfer,
  receiveTransfer,
  cancelTransfer,
  getConsolidated,
};
