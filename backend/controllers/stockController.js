const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const { recordMovement } = require('../utils/stockMovement');
const { recordControlledReceipt, recordControlledMovement } = require('../services/clinical');

const ADJUSTMENT_TYPES = ['damaged', 'expired', 'correction'];
const ADJUSTMENT_MOVEMENT = {
  damaged: 'adjust_damaged',
  expired: 'adjust_expired',
  correction: 'correction',
};

// Compare two dates by calendar day (UTC)
const sameDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// @desc    Get all stock batches for logged-in pharmacy (FEFO ordered)
// @route   GET /api/stock
// @access  Private (Pharmacist only)
const getStockBatches = async (req, res) => {
  const { medicineId, status } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (medicineId) {
    if (!mongoose.isValidObjectId(medicineId)) {
      throw new AppError('Invalid medicine id', 400);
    }
    query.medicineId = medicineId;
  }

  if (typeof status === 'string' && status) {
    query.status = status;
  }

  const batches = await StockBatch.find(query)
    .populate('medicineId', 'name genericName category dosageForm strength price minStockLevel barcode baseUnit packUnits')
    .sort({ expiryDate: 1 });

  return res.status(200).json({
    success: true,
    count: batches.length,
    batches,
  });
};

// @desc    Add a new stock batch (Stock-In)
// @route   POST /api/stock
// @access  Private (Pharmacist only)
const addStockBatch = async (req, res) => {
  // Optional `unitName`: quantity (and purchasePrice) are then per pack unit and
  // converted to base units (stock is always stored in the base unit).
  const { medicineId, batchNo, quantity, expiryDate, purchasePrice, unitName } = req.body;

  if (!medicineId || typeof batchNo !== 'string' || !batchNo.trim() || quantity === undefined || !expiryDate) {
    throw new AppError('Please provide medicine, batch number, quantity, and expiry date', 400);
  }
  if (!mongoose.isValidObjectId(medicineId)) {
    throw new AppError('Invalid medicine id', 400);
  }

  const qtyEntered = Number(quantity);
  if (!Number.isInteger(qtyEntered) || qtyEntered <= 0) {
    throw new AppError('Quantity must be a positive whole number', 400);
  }

  const exp = new Date(expiryDate);
  if (Number.isNaN(exp.getTime()) || exp <= new Date()) {
    throw new AppError('Expiry date must be a valid future date', 400);
  }

  let priceEntered;
  if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== '') {
    priceEntered = Number(purchasePrice);
    if (!Number.isFinite(priceEntered) || priceEntered < 0) {
      throw new AppError('Purchase price must be a non-negative number', 400);
    }
  }

  const trimmedBatchNo = batchNo.trim();
  const session = await mongoose.startSession();
  let batchId;

  try {
    await session.withTransaction(async () => {
      const medicine = await Medicine.findOne({
        _id: medicineId,
        pharmacyId: req.pharmacyId,
      }).session(session);

      if (!medicine) {
        throw new AppError('Medicine not found in your pharmacy catalog', 404);
      }
      if (medicine.isArchived) {
        throw new AppError('Medicine is archived', 400);
      }

      let factor = 1;
      const unit = typeof unitName === 'string' ? unitName.trim().toLowerCase() : '';
      if (unit && unit !== String(medicine.baseUnit || 'unit').toLowerCase()) {
        const pack = (medicine.packUnits || []).find((p) => p.name.toLowerCase() === unit);
        if (!pack) throw new AppError(`Unknown unit "${unitName}" for this medicine`, 400);
        factor = pack.factor;
      }
      const qty = qtyEntered * factor;
      const price = priceEntered === undefined ? undefined : Math.round((priceEntered / factor) * 10000) / 10000;

      let batch = await StockBatch.findOne({
        pharmacyId: req.pharmacyId,
        medicineId,
        batchNo: trimmedBatchNo,
      }).session(session);

      if (batch) {
        if (!sameDay(batch.expiryDate, exp)) {
          throw new AppError(
            `Batch "${trimmedBatchNo}" already exists with a different expiry date (${batch.expiryDate.toISOString().slice(0, 10)})`,
            400
          );
        }
        batch.quantity += qty;
        batch.initialQuantity += qty;
        if (price !== undefined) batch.purchasePrice = price;
        if (batch.quantity > 0 && batch.status === 'depleted') batch.status = 'active';
        await batch.save({ session });
      } else {
        [batch] = await StockBatch.create(
          [
            {
              pharmacyId: req.pharmacyId,
              medicineId,
              batchNo: trimmedBatchNo,
              quantity: qty,
              initialQuantity: qty,
              expiryDate: exp,
              purchasePrice: price ?? 0,
              status: 'active',
            },
          ],
          { session }
        );
      }

      await recordMovement(
        {
          pharmacyId: req.pharmacyId,
          batchId: batch._id,
          medicineId: medicine._id,
          type: 'stock_in',
          quantityChange: qty,
          balanceAfter: batch.quantity,
          userId: req.user?._id,
        },
        { session }
      );
      // Controlled substances register (no-op for non-controlled medicines)
      await recordControlledReceipt(
        {
          pharmacyId: req.pharmacyId,
          medicineId: medicine._id,
          batchId: batch._id,
          quantity: qty,
          userId: req.user?._id,
          refId: batch._id,
        },
        { session }
      );

      batchId = batch._id;
    });
  } finally {
    await session.endSession();
  }

  const batch = await StockBatch.findById(batchId).populate(
    'medicineId',
    'name genericName category dosageForm strength price'
  );

  return res.status(201).json({
    success: true,
    message: 'Stock batch added successfully',
    batch,
  });
};

// @desc    Adjust stock (damaged, expired, or correction)
// @route   PATCH /api/stock/:id/adjust
// @access  Private (Pharmacist only)
const adjustStock = async (req, res) => {
  const { adjustmentType = 'correction', reduceQty, reason } = req.body;

  if (!ADJUSTMENT_TYPES.includes(adjustmentType)) {
    throw new AppError(`Adjustment type must be one of: ${ADJUSTMENT_TYPES.join(', ')}`, 400);
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError('Stock batch not found', 404);
  }

  const qtyToReduce = Number(reduceQty);
  if (!Number.isInteger(qtyToReduce) || qtyToReduce <= 0) {
    throw new AppError('Please provide a valid quantity to reduce', 400);
  }

  const session = await mongoose.startSession();
  let batchId;

  try {
    await session.withTransaction(async () => {
      const existing = await StockBatch.findOne({
        _id: req.params.id,
        pharmacyId: req.pharmacyId,
      }).session(session);

      if (!existing) {
        throw new AppError('Stock batch not found', 404);
      }
      if (qtyToReduce > existing.quantity) {
        throw new AppError(
          `Cannot reduce more than current available quantity (${existing.quantity})`,
          400
        );
      }

      const updated = await StockBatch.findOneAndUpdate(
        { _id: existing._id, pharmacyId: req.pharmacyId, quantity: { $gte: qtyToReduce } },
        { $inc: { quantity: -qtyToReduce } },
        { returnDocument: 'after', session }
      );
      if (!updated) {
        throw new AppError('Stock changed while adjusting, please retry', 409);
      }

      if (updated.quantity === 0) {
        updated.status = adjustmentType === 'expired' ? 'expired' : 'depleted';
        await updated.save({ session });
      }

      await recordMovement(
        {
          pharmacyId: req.pharmacyId,
          batchId: updated._id,
          medicineId: updated.medicineId,
          type: ADJUSTMENT_MOVEMENT[adjustmentType],
          quantityChange: -qtyToReduce,
          balanceAfter: updated.quantity,
          reason: typeof reason === 'string' ? reason.trim() : '',
          userId: req.user?._id,
        },
        { session }
      );
      await recordControlledMovement(
        {
          pharmacyId: req.pharmacyId,
          medicineId: updated.medicineId,
          batchId: updated._id,
          entryType: 'adjust',
          quantityOut: qtyToReduce,
          userId: req.user?._id,
          refId: updated._id,
          notes: `Stock adjustment (${adjustmentType})`,
        },
        { session }
      );

      batchId = updated._id;
    });
  } finally {
    await session.endSession();
  }

  const batch = await StockBatch.findById(batchId).populate(
    'medicineId',
    'name genericName dosageForm strength'
  );

  return res.status(200).json({
    success: true,
    message: `Stock adjusted successfully (${adjustmentType})`,
    batch,
  });
};

// @desc    Get inventory summary, low stock, and expiring items
// @route   GET /api/stock/summary
// @access  Private (Pharmacist only)
const getInventorySummary = async (req, res) => {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const stockedBatches = await StockBatch.find({
    pharmacyId: req.pharmacyId,
    status: 'active',
    quantity: { $gt: 0 },
  }).populate('medicineId', 'name minStockLevel');

  // Only non-expired batches count as sellable stock
  const activeBatches = stockedBatches.filter((b) => new Date(b.expiryDate) > now);
  const expiredActiveBatches = stockedBatches.filter((b) => new Date(b.expiryDate) <= now);

  const totalStockUnits = activeBatches.reduce((sum, b) => sum + b.quantity, 0);

  const expiringSoonBatches = activeBatches.filter(
    (b) => new Date(b.expiryDate) <= thirtyDaysFromNow
  );

  const stockByMedicine = new Map();
  activeBatches.forEach((b) => {
    const id = b.medicineId?._id?.toString();
    if (!id) return;
    stockByMedicine.set(id, (stockByMedicine.get(id) || 0) + b.quantity);
  });

  const medicines = await Medicine.find({ pharmacyId: req.pharmacyId }).select('name minStockLevel');
  const lowStockMedicines = [];

  medicines.forEach((med) => {
    const medStock = stockByMedicine.get(med._id.toString()) || 0;
    if (medStock <= med.minStockLevel) {
      lowStockMedicines.push({
        _id: med._id,
        name: med.name,
        currentStock: medStock,
        minStockLevel: med.minStockLevel,
      });
    }
  });

  return res.status(200).json({
    success: true,
    summary: {
      totalBatches: activeBatches.length,
      totalStockUnits,
      expiringSoonCount: expiringSoonBatches.length,
      expiringSoonBatches,
      lowStockCount: lowStockMedicines.length,
      lowStockMedicines,
      // Batches past expiry still marked active with stock: need to be written off
      expiredCount: expiredActiveBatches.length,
      expiredUnits: expiredActiveBatches.reduce((sum, b) => sum + b.quantity, 0),
      expiredBatches: expiredActiveBatches,
    },
  });
};

// @desc    Delete a stock batch
// @route   DELETE /api/stock/:id
// @access  Private (Pharmacist only)
const deleteStockBatch = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError('Stock batch not found', 404);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const batch = await StockBatch.findOne({
        _id: req.params.id,
        pharmacyId: req.pharmacyId,
      }).session(session);

      if (!batch) {
        throw new AppError('Stock batch not found', 404);
      }

      const referenced = await Sale.exists({
        pharmacyId: req.pharmacyId,
        'items.batchId': batch._id,
      }).session(session);
      if (referenced) {
        throw new AppError(
          'This batch has sales recorded against it and cannot be deleted. Adjust its quantity instead.',
          409
        );
      }

      await recordMovement(
        {
          pharmacyId: req.pharmacyId,
          batchId: batch._id,
          medicineId: batch.medicineId,
          type: 'delete',
          quantityChange: -batch.quantity,
          balanceAfter: 0,
          reason: `Batch ${batch.batchNo} deleted`,
          userId: req.user?._id,
        },
        { session }
      );

      await batch.deleteOne({ session });
      if (batch.quantity > 0) {
        await recordControlledMovement(
          {
            pharmacyId: req.pharmacyId,
            medicineId: batch.medicineId,
            batchId: batch._id,
            entryType: 'adjust',
            quantityOut: batch.quantity,
            userId: req.user?._id,
            refId: batch._id,
            notes: `Batch ${batch.batchNo} deleted`,
          },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }

  return res.status(200).json({
    success: true,
    message: 'Stock batch deleted successfully',
  });
};

module.exports = {
  getStockBatches,
  addStockBatch,
  adjustStock,
  getInventorySummary,
  deleteStockBatch,
};
