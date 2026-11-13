const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');
const AppError = require('../utils/AppError');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { recordMovement } = require('../utils/stockMovement');

const ALLOWED_PAYMENTS = ['cash', 'card', 'mobile_money', 'credit'];

const toMoney = (n) => Number(Number(n).toFixed(2));
const cleanString = (v) => (typeof v === 'string' ? v.trim() : '');

// Returns a valid IANA timezone name, falling back to UTC.
const resolveTimeZone = (tz) => {
  if (typeof tz !== 'string' || !tz.trim()) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return 'UTC';
  }
};

// @desc    Process new sale with automatic FEFO stock batch deduction
// @route   POST /api/sales
// @access  Private (Pharmacist only)
const createSale = async (req, res) => {
  const {
    items,
    customer,
    discount = 0,
    tax = 0,
    paymentMethod = 'cash',
    notes = '',
    prescription,
  } = req.body;

  // ---- Validate everything before touching stock ----
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Sale must contain at least one item', 400);
  }

  const requested = items.map((item) => {
    const qty = Number(item?.quantity);
    if (
      !item?.medicineId ||
      !mongoose.isValidObjectId(item.medicineId) ||
      !Number.isInteger(qty) ||
      qty <= 0
    ) {
      throw new AppError('Invalid item data provided', 400);
    }
    return { medicineId: String(item.medicineId), quantity: qty };
  });

  const discountVal = Number(discount);
  const taxVal = Number(tax);
  if (!Number.isFinite(discountVal) || !Number.isFinite(taxVal) || discountVal < 0 || taxVal < 0) {
    throw new AppError('Discount and tax must be non-negative numbers', 400);
  }
  if (!ALLOWED_PAYMENTS.includes(paymentMethod)) {
    throw new AppError('Invalid payment method', 400);
  }

  const prescriptionData = {
    number: cleanString(prescription?.number),
    prescriber: cleanString(prescription?.prescriber),
    notes: cleanString(prescription?.notes),
  };

  const session = await mongoose.startSession();
  try {
    let sale;

    await session.withTransaction(async () => {
      // Reset per-attempt state (withTransaction may retry this callback)
      const saleItems = [];
      const movements = [];
      const now = new Date();

      const uniqueIds = [...new Set(requested.map((r) => r.medicineId))];
      const medicines = await Medicine.find({
        _id: { $in: uniqueIds },
        pharmacyId: req.pharmacyId,
      }).session(session);

      if (medicines.length !== uniqueIds.length) {
        throw new AppError('Medicine not found in your catalog', 404);
      }
      const archived = medicines.filter((m) => m.isArchived);
      if (archived.length > 0) {
        throw new AppError(`Medicine is archived: ${archived.map((m) => m.name).join(', ')}`, 400);
      }
      const medById = new Map(medicines.map((m) => [m._id.toString(), m]));

      // Prescription enforcement (#14)
      const rxMeds = medicines.filter((m) => m.requiresPrescription);
      if (rxMeds.length > 0 && (!prescriptionData.number || !prescriptionData.prescriber)) {
        throw new AppError(
          `Prescription number and prescriber are required for: ${rxMeds.map((m) => m.name).join(', ')}`,
          400
        );
      }

      // Subtotal is known before deducting stock, so check discount up front
      const expectedSubtotal = toMoney(
        requested.reduce((sum, r) => sum + r.quantity * medById.get(r.medicineId).price, 0)
      );
      if (discountVal > expectedSubtotal) {
        throw new AppError('Discount cannot exceed subtotal', 400);
      }

      let subtotal = 0;

      for (const reqItem of requested) {
        const medicine = medById.get(reqItem.medicineId);

        // Active, non-expired batches by earliest expiry (FEFO)
        const batches = await StockBatch.find({
          pharmacyId: req.pharmacyId,
          medicineId: medicine._id,
          status: 'active',
          quantity: { $gt: 0 },
          expiryDate: { $gt: now },
        })
          .sort({ expiryDate: 1 })
          .session(session);

        const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
        if (totalAvailable < reqItem.quantity) {
          throw new AppError(
            `Insufficient stock for "${medicine.name}". Requested: ${reqItem.quantity}, Available: ${totalAvailable}`,
            400
          );
        }

        let remaining = reqItem.quantity;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(batch.quantity, remaining);

          // Atomic conditional decrement: never oversell under concurrency
          const updated = await StockBatch.findOneAndUpdate(
            { _id: batch._id, quantity: { $gte: take } },
            { $inc: { quantity: -take } },
            { returnDocument: 'after', session }
          );
          if (!updated) {
            throw new AppError('Stock changed while processing the sale, please retry', 409);
          }
          if (updated.quantity === 0) {
            await StockBatch.updateOne(
              { _id: updated._id, quantity: 0, status: 'active' },
              { $set: { status: 'depleted' } },
              { session }
            );
          }

          const itemSubtotal = toMoney(take * medicine.price);
          subtotal += itemSubtotal;

          saleItems.push({
            medicineId: medicine._id,
            name: medicine.name,
            batchId: batch._id,
            batchNo: batch.batchNo,
            quantity: take,
            unitPrice: medicine.price,
            subtotal: itemSubtotal,
          });
          movements.push({
            pharmacyId: req.pharmacyId,
            batchId: batch._id,
            medicineId: medicine._id,
            type: 'sale',
            quantityChange: -take,
            balanceAfter: updated.quantity,
            userId: req.user._id,
          });

          remaining -= take;
        }
      }

      subtotal = toMoney(subtotal);
      if (discountVal > subtotal) {
        throw new AppError('Discount cannot exceed subtotal', 400);
      }
      const grandTotal = toMoney(Math.max(0, subtotal - discountVal + taxVal));

      const seq = await nextSequence(req.pharmacyId, 'invoice', { session });
      const invoiceNumber = formatSequence('INV', seq);

      const saleDoc = {
        pharmacyId: req.pharmacyId,
        pharmacistId: req.user._id,
        staffId: req.user._id,
        invoiceNumber,
        customer: {
          name: cleanString(customer?.name) || 'Walk-in Customer',
          phone: cleanString(customer?.phone),
        },
        items: saleItems,
        subtotal,
        discount: discountVal,
        tax: taxVal,
        grandTotal,
        paymentMethod,
        paymentStatus: 'paid',
        notes: typeof notes === 'string' ? notes : '',
      };
      if (prescriptionData.number || prescriptionData.prescriber) {
        saleDoc.prescription = prescriptionData;
      }

      [sale] = await Sale.create([saleDoc], { session });

      for (const m of movements) {
        await recordMovement({ ...m, refId: sale._id, refModel: 'Sale' }, { session });
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      sale,
    });
  } finally {
    await session.endSession();
  }
};

// @desc    Get sales history for logged-in pharmacy
// @route   GET /api/sales
// @access  Private (Pharmacist only)
const getSales = async (req, res) => {
  const { search, limit = 50, page = 1 } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (typeof search === 'string' && search.trim()) {
    const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { invoiceNumber: { $regex: sanitized, $options: 'i' } },
      { 'customer.name': { $regex: sanitized, $options: 'i' } },
      { 'customer.phone': { $regex: sanitized, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const total = await Sale.countDocuments(query);
  const sales = await Sale.find(query)
    .populate('pharmacistId', 'name email')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  return res.status(200).json({
    success: true,
    total,
    page: pageNum,
    limit: limitNum,
    sales: sales || [],
  });
};

// @desc    Get single sale details
// @route   GET /api/sales/:id
// @access  Private (Pharmacist only)
const getSaleById = async (req, res) => {
  const sale = await Sale.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  })
    .populate('pharmacistId', 'name email')
    .populate('items.medicineId', 'name genericName category dosageForm strength');

  if (!sale) {
    throw new AppError('Sale transaction not found', 404);
  }

  return res.status(200).json({
    success: true,
    sale,
  });
};

// @desc    Get sales statistics for dashboard
// @route   GET /api/sales/summary
// @access  Private (Pharmacist only)
const getSalesSummary = async (req, res) => {
  const timeZone = resolveTimeZone(req.headers['x-timezone']);
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const pharmacyId = new mongoose.Types.ObjectId(String(req.pharmacyId));

  const [result] = await Sale.aggregate([
    { $match: { pharmacyId } },
    {
      $project: {
        grandTotal: { $ifNull: ['$grandTotal', 0] },
        isToday: {
          $eq: [
            { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: timeZone } },
            todayStr,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        totalSalesCount: { $sum: 1 },
        totalRevenue: { $sum: '$grandTotal' },
        todaySalesCount: { $sum: { $cond: ['$isToday', 1, 0] } },
        todayRevenue: { $sum: { $cond: ['$isToday', '$grandTotal', 0] } },
      },
    },
  ]);

  return res.status(200).json({
    success: true,
    summary: {
      todaySalesCount: result?.todaySalesCount || 0,
      todayRevenue: toMoney(result?.todayRevenue || 0),
      totalSalesCount: result?.totalSalesCount || 0,
      totalRevenue: toMoney(result?.totalRevenue || 0),
    },
  });
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
  getSalesSummary,
};
