const Transfer = require('../../models/Transfer');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const AppError = require('../../utils/AppError');
const escapeRegex = require('../../utils/escapeRegex');
const { recordMovement } = require('../../utils/stockMovement');
const { audit } = require('../../utils/audit');
const { isId, sameDay, runTransaction } = require('./helpers');

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

module.exports = {
  receiveTransfer,
};
