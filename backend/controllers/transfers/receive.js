const Transfer = require('../../models/Transfer');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const AppError = require('../../utils/AppError');
const escapeRegex = require('../../utils/escapeRegex');
const { recordMovement } = require('../../utils/stockMovement');
const { audit } = require('../../utils/audit');
const { isId, sameDay, runTransaction, recordTransferRegister } = require('./helpers');
const { weightedAverageCost } = require('../purchaseOrders/helpers');

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const describe = (m) =>
  [m.name, m.strength, m.dosageForm].filter(Boolean).join(' ') + ` (base unit "${m.baseUnit || 'unit'}")`;

// Stock moves in base units, so the destination medicine must count in the same base unit and
// any pack unit both catalogs define must hold the same number of base units. A mismatch is
// refused (409) rather than silently converted.
const assertCompatible = (src, dest) => {
  const problems = [];
  if (norm(src.baseUnit || 'unit') !== norm(dest.baseUnit || 'unit')) {
    problems.push(`base unit "${dest.baseUnit || 'unit'}" here vs "${src.baseUnit || 'unit'}" at the sending branch`);
  }
  const destPacks = new Map((dest.packUnits || []).map((p) => [norm(p.name), p.factor]));
  for (const p of src.packUnits || []) {
    const f = destPacks.get(norm(p.name));
    if (f !== undefined && Number(f) !== Number(p.factor)) {
      problems.push(`pack "${p.name}" holds ${f} here vs ${p.factor} at the sending branch`);
    }
  }
  if (problems.length) {
    throw new AppError(
      `Cannot receive "${src.name}": this branch's medicine ${describe(dest)} does not match the sent medicine (${problems.join('; ')}). Align the units of "${dest.name}" in this branch's catalog, then receive again.`,
      409
    );
  }
};

// Finds the destination medicine for a transfer line, or creates a copy of the source medicine
// in the destination catalog. Matching order:
//   1. barcode, then SKU, of the source medicine (when it has one)
//   2. name (case-insensitive) + strength + dosage form; a same-name medicine with another
//      strength / form is a conflict (409), never a match
// The matched medicine must use the same base unit / pack factors (409 otherwise).
const destinationMedicine = async ({ line, fromPharmacyId, toPharmacyId, session, cache }) => {
  const key = String(line.medicineId);
  if (cache.has(key)) return cache.get(key);

  const name = (line.medicineName || '').trim();
  const srcDoc = await Medicine.findOne({ _id: line.medicineId, pharmacyId: fromPharmacyId }).session(session);
  const src = srcDoc
    ? srcDoc.toObject()
    : { name, category: 'General', price: line.unitCost || 0, baseUnit: 'unit', packUnits: [] };

  let med = null;
  if (src.barcode) {
    med = await Medicine.findOne({ pharmacyId: toPharmacyId, barcode: src.barcode }).session(session);
  }
  if (!med && src.sku && String(src.sku).trim()) {
    med = await Medicine.findOne({ pharmacyId: toPharmacyId, sku: String(src.sku).trim() }).session(session);
  }
  if (!med) {
    const byName = await Medicine.findOne({
      pharmacyId: toPharmacyId,
      name: { $regex: `^${escapeRegex(src.name || name)}$`, $options: 'i' },
    }).session(session);
    if (byName && srcDoc) {
      const strengthDiffers = norm(byName.strength) !== norm(src.strength);
      const formDiffers = norm(byName.dosageForm) !== norm(src.dosageForm);
      if (strengthDiffers || formDiffers) {
        throw new AppError(
          `Cannot receive "${src.name}": this branch already has ${describe(byName)} but the sent medicine is ${describe(src)}. Give them matching barcodes or fix the strength / form, then receive again.`,
          409
        );
      }
    }
    med = byName;
  }

  if (med) {
    if (srcDoc) assertCompatible(src, med);
  } else {
    let barcode = src.barcode;
    if (barcode && (await Medicine.exists({ pharmacyId: toPharmacyId, barcode }).session(session))) {
      barcode = undefined;
    }
    [med] = await Medicine.create(
      [
        {
          pharmacyId: toPharmacyId,
          name: src.name || name,
          genericName: src.genericName || '',
          category: src.category || 'General',
          dosageForm: src.dosageForm,
          strength: src.strength || '',
          price: src.price || 0,
          costPrice: src.costPrice || line.unitCost || 0,
          minStockLevel: src.minStockLevel,
          requiresPrescription: Boolean(src.requiresPrescription),
          barcode,
          sku: src.sku || '',
          baseUnit: src.baseUnit || 'unit',
          // Pack barcodes are dropped: they may clash with the destination catalog
          packUnits: (src.packUnits || []).map((p) => ({ name: p.name, factor: p.factor, price: p.price })),
          taxExempt: Boolean(src.taxExempt),
          isControlled: Boolean(src.isControlled),
          controlledSchedule: src.controlledSchedule || '',
          minMarginPercent: src.minMarginPercent ?? null,
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
    // Weighted average cost over the units on hand and the units received
    const purchasePrice = weightedAverageCost({
      onHandQty: existing.quantity,
      onHandCost: existing.purchasePrice || 0,
      paidQty: line.quantity,
      paidCost: line.unitCost || 0,
    });
    const updated = await StockBatch.findOneAndUpdate(
      { _id: existing._id },
      {
        $inc: { quantity: line.quantity },
        $set: { status: existing.status === 'depleted' ? 'active' : existing.status, purchasePrice },
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
      const medicine = await destinationMedicine({
        line,
        fromPharmacyId: doc.fromPharmacyId,
        toPharmacyId,
        session,
        cache,
      });
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
      await recordTransferRegister(
        {
          direction: 'in',
          pharmacyId: toPharmacyId,
          medicineId: medicine._id,
          batchId: batch._id,
          quantity: line.quantity,
          userId: req.user._id,
          transfer: doc,
          notes: `Transfer ${doc.number} received (in)`,
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

module.exports = {
  receiveTransfer,
};
