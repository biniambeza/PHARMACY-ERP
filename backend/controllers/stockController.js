const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { recordMovement } = require('../utils/stockMovement');
const { recordControlledReceipt, recordControlledMovement } = require('../services/clinical');
const { weightedAverageCost } = require('./purchaseOrders/helpers');

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
// Query params (all optional):
//   medicineId       only this medicine's batches
//   status           active | depleted | expired | discarded
//   q                medicine name / generic name / barcode, or batch number
//   expiringWithin   days: only batches expiring within N days (including already expired)
//   includeEmpty     'true' to include batches with quantity 0 (default: excluded,
//                    except when status=depleted is asked for explicitly)
//   page, limit      pagination (limit default 500, max 2000)
// Response: { batches, count, total, page, limit, pages, truncated }
const STOCK_LIST_DEFAULT_LIMIT = 500;
const STOCK_LIST_MAX_LIMIT = 2000;
const STOCK_BATCH_FIELDS = 'medicineId batchNo quantity initialQuantity expiryDate purchasePrice status createdAt updatedAt';
const STOCK_MEDICINE_FIELDS = 'name genericName category dosageForm strength price minStockLevel barcode baseUnit packUnits';
const BATCH_STATUSES = ['active', 'depleted', 'expired', 'discarded'];

const getStockBatches = async (req, res) => {
  const { medicineId, status, q, expiringWithin } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (medicineId) {
    if (!mongoose.isValidObjectId(medicineId)) {
      throw new AppError('Invalid medicine id', 400);
    }
    query.medicineId = medicineId;
  }

  if (typeof status === 'string' && status) {
    if (!BATCH_STATUSES.includes(status)) throw new AppError(`status must be one of ${BATCH_STATUSES.join(', ')}`, 400);
    query.status = status;
  }

  const includeEmpty = String(req.query.includeEmpty) === 'true' || query.status === 'depleted';
  if (!includeEmpty) query.quantity = { $gt: 0 };

  if (expiringWithin !== undefined && expiringWithin !== '') {
    const days = Number(expiringWithin);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      throw new AppError('expiringWithin must be a whole number of days (0-3650)', 400);
    }
    // Includes batches already past expiry that are still on the shelf (they need action too)
    query.expiryDate = { $lte: new Date(Date.now() + days * 24 * 60 * 60 * 1000) };
  }

  if (typeof q === 'string' && q.trim()) {
    const term = q.trim().slice(0, 100);
    const pattern = escapeRegex(term);
    const medIds = await Medicine.find({
      pharmacyId: req.pharmacyId,
      $or: [
        { name: { $regex: pattern, $options: 'i' } },
        { genericName: { $regex: pattern, $options: 'i' } },
        { barcode: term },
      ],
    }).distinct('_id');
    query.$or = [{ medicineId: { $in: medIds } }, { batchNo: { $regex: pattern, $options: 'i' } }];
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    STOCK_LIST_MAX_LIMIT,
    Math.max(1, parseInt(req.query.limit, 10) || STOCK_LIST_DEFAULT_LIMIT)
  );

  const [batches, total] = await Promise.all([
    StockBatch.find(query)
      .select(STOCK_BATCH_FIELDS)
      .populate('medicineId', STOCK_MEDICINE_FIELDS)
      .sort({ expiryDate: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockBatch.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    count: batches.length,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    truncated: (page - 1) * limit + batches.length < total,
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
      let costChange = null;

      if (batch) {
        if (!sameDay(batch.expiryDate, exp)) {
          throw new AppError(
            `Batch "${trimmedBatchNo}" already exists with a different expiry date (${batch.expiryDate.toISOString().slice(0, 10)})`,
            400
          );
        }
        // Weighted average over the units on hand and the new units (no price given = the new
        // units are assumed to cost the same as the batch, so its cost is unchanged).
        if (price !== undefined) {
          const costBefore = batch.purchasePrice || 0;
          const costAfter = weightedAverageCost({
            onHandQty: batch.quantity,
            onHandCost: costBefore,
            paidQty: qty,
            paidCost: price,
          });
          batch.purchasePrice = costAfter;
          if (costAfter !== costBefore) costChange = { costBefore, costAfter };
        }
        batch.quantity += qty;
        batch.initialQuantity += qty;
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
          ...(costChange ? { meta: costChange } : {}),
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
        // 'expired' only for a batch actually past its expiry date: an emptied in-date batch is
        // 'depleted' so stock added back later (returns, voids, stock-in) can be sold again.
        const pastExpiry = updated.expiryDate && new Date(updated.expiryDate) <= new Date();
        updated.status = adjustmentType === 'expired' && pastExpiry ? 'expired' : 'depleted';
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

// Lists in the summary response are trimmed to this many rows (counts are always complete).
const SUMMARY_LIST_LIMIT = 50;

// Medicines at or below their minimum stock level, counting only sellable stock
// (active, unexpired batches). Same rule as the daily low-stock check
// (jobs/dailyChecks.js findLowStock): archived medicines and medicines with
// minStockLevel 0 (no minimum set) are never flagged. Sorted by stock, lowest first.
const findLowStockMedicines = (pharmacyId, now = new Date()) =>
  Medicine.aggregate([
    { $match: { pharmacyId, isArchived: { $ne: true }, minStockLevel: { $gt: 0 } } },
    { $project: { name: 1, minStockLevel: 1 } },
    {
      $lookup: {
        from: StockBatch.collection.name,
        let: { medId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$medicineId', '$$medId'] },
              pharmacyId,
              status: 'active',
              quantity: { $gt: 0 },
              expiryDate: { $gt: now },
            },
          },
          { $group: { _id: null, qty: { $sum: '$quantity' } } },
        ],
        as: 'stock',
      },
    },
    { $set: { currentStock: { $ifNull: [{ $first: '$stock.qty' }, 0] } } },
    { $match: { $expr: { $lte: ['$currentStock', '$minStockLevel'] } } },
    { $project: { name: 1, currentStock: 1, minStockLevel: 1 } },
    { $sort: { currentStock: 1, name: 1 } },
  ]);

// @desc    Get inventory summary, low stock, and expiring items
// @route   GET /api/stock/summary
// @access  Private (Pharmacist only)
const getInventorySummary = async (req, res) => {
  const pharmacyId = new mongoose.Types.ObjectId(String(req.pharmacyId));
  const now = new Date();
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const batchList = (match) => [
    { $match: match },
    { $sort: { expiryDate: 1, _id: 1 } },
    { $limit: SUMMARY_LIST_LIMIT },
    {
      $lookup: {
        from: Medicine.collection.name,
        localField: 'medicineId',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, minStockLevel: 1 } }],
        as: 'medicineId',
      },
    },
    { $set: { medicineId: { $first: '$medicineId' } } },
    { $project: { medicineId: 1, batchNo: 1, quantity: 1, expiryDate: 1, purchasePrice: 1, status: 1 } },
  ];

  // One pass over the pharmacy's active batches with stock (index: pharmacyId, status, expiryDate).
  const [[facet], lowStockMedicines] = await Promise.all([
    StockBatch.aggregate([
      { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 } } },
      {
        $facet: {
          sellable: [
            { $match: { expiryDate: { $gt: now } } },
            {
              $group: {
                _id: null,
                batches: { $sum: 1 },
                units: { $sum: '$quantity' },
                value: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
              },
            },
          ],
          expired: [
            { $match: { expiryDate: { $lte: now } } },
            { $group: { _id: null, batches: { $sum: 1 }, units: { $sum: '$quantity' } } },
          ],
          expiringSoon: batchList({ expiryDate: { $gt: now, $lte: thirtyDaysFromNow } }),
          expiringSoonCount: [{ $match: { expiryDate: { $gt: now, $lte: thirtyDaysFromNow } } }, { $count: 'n' }],
          expiredBatches: batchList({ expiryDate: { $lte: now } }),
        },
      },
    ]),
    findLowStockMedicines(pharmacyId, now),
  ]);

  const sellable = facet.sellable[0] || { batches: 0, units: 0, value: 0 };
  const expired = facet.expired[0] || { batches: 0, units: 0 };
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  return res.status(200).json({
    success: true,
    summary: {
      totalBatches: sellable.batches,
      totalStockUnits: sellable.units,
      // Names the Stock page reads (same figures)
      activeBatchesCount: sellable.batches,
      totalUnits: sellable.units,
      totalValuation: round2(sellable.value),
      expiringSoonCount: facet.expiringSoonCount[0]?.n || 0,
      // Soonest-expiring first, at most SUMMARY_LIST_LIMIT (see the count for the full number)
      expiringSoonBatches: facet.expiringSoon,
      lowStockCount: lowStockMedicines.length,
      lowStockMedicines: lowStockMedicines.slice(0, SUMMARY_LIST_LIMIT),
      // Batches past expiry still marked active with stock: need to be written off
      expiredCount: expired.batches,
      expiredUnits: expired.units,
      expiredBatches: facet.expiredBatches,
      listLimit: SUMMARY_LIST_LIMIT,
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
