const mongoose = require('mongoose');
const Pharmacy = require('../../models/Pharmacy');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const AppError = require('../../utils/AppError');
const { recordMovement } = require('../../utils/stockMovement');
const { sameId } = require('../../utils/membership');
const { recordControlledMovement } = require('../../services/clinical');

const MAX_LINES = 200;
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const sameDay = (a, b) => a && b && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// ----- helpers ---------------------------------------------------------------

// Controlled-substance register entry for a transfer leg (no-op for non-controlled medicines).
// Uses the 'transfer_out' / 'transfer_in' entry types when services/clinical accepts them;
// until then it falls back to 'adjust' (out) / 'receive' (in), with the transfer in the notes.
// Call AFTER the batch quantity has changed, inside the same transaction.
let transferEntryTypesSupported = true;
const recordTransferRegister = async (
  { direction, pharmacyId, medicineId, batchId, quantity, userId, transfer, notes },
  { session }
) => {
  const out = direction === 'out';
  const entry = {
    pharmacyId,
    medicineId,
    batchId,
    quantityOut: out ? quantity : 0,
    quantityIn: out ? 0 : quantity,
    userId,
    refId: transfer._id,
    notes,
  };
  if (transferEntryTypesSupported) {
    try {
      return await recordControlledMovement({ ...entry, entryType: out ? 'transfer_out' : 'transfer_in' }, { session });
    } catch (err) {
      // Rejected before any read/write, so the transaction is unaffected.
      if (!(err instanceof AppError) || !/entry type/i.test(err.message)) throw err;
      transferEntryTypesSupported = false;
    }
  }
  return recordControlledMovement({ ...entry, entryType: out ? 'adjust' : 'receive' }, { session });
};

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
      await recordTransferRegister(
        {
          direction: 'out',
          pharmacyId,
          medicineId: medicine._id,
          batchId: batch._id,
          quantity: qty,
          userId,
          transfer,
          notes: `Transfer ${transfer.number} sent (out)`,
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

module.exports = {
  isId,
  sameDay,
  parseLines,
  resolveDestination,
  allocateAndDeduct,
  runTransaction,
  populateTransfer,
  recordTransferRegister,
};
