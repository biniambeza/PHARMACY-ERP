const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { buildPurchaseOrderItems, insertPurchaseOrder } = require('./purchaseOrderController');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CREATE_LINES = 500;
const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const isValidId = (id) =>
  (typeof id === 'string' || id instanceof mongoose.Types.ObjectId) && OBJECT_ID_PATTERN.test(String(id));

const toMap = (rows, field = 'total') => new Map(rows.map((r) => [String(r._id), r[field]]));

// Most recent non-zero purchase price per medicine (from stock batches).
const lastPurchasePrices = async (pharmacyId, medicineIds) => {
  const match = { pharmacyId, purchasePrice: { $gt: 0 } };
  if (medicineIds) match.medicineId = { $in: medicineIds };
  const rows = await StockBatch.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$medicineId', total: { $first: '$purchasePrice' } } },
  ]);
  return toMap(rows);
};

/**
 * Compute reorder suggestions for a pharmacy.
 *   avgDaily   = units sold (non-voided sales) in the window / days
 *   suggestion = ceil(avgDaily * (leadTimeDays + reorderSafetyDays)) - sellableStock - onOrder
 * Medicines below their minStockLevel are always included (flagged), topped up to the minimum.
 */
const computeSuggestions = async (pharmacyId, days) => {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);

  const [salesRows, stockRows, onOrderRows, medicines] = await Promise.all([
    Sale.aggregate([
      { $match: { pharmacyId, createdAt: { $gte: since }, voided: { $ne: true } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.medicineId', total: { $sum: '$items.quantity' } } },
    ]),
    StockBatch.aggregate([
      { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
      { $group: { _id: '$medicineId', total: { $sum: '$quantity' } } },
    ]),
    PurchaseOrder.aggregate([
      { $match: { pharmacyId, status: { $in: ['ordered', 'partially_received'] } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.medicineId',
          total: {
            $sum: {
              $max: [0, { $subtract: ['$items.quantityOrdered', { $ifNull: ['$items.quantityReceived', 0] }] }],
            },
          },
        },
      },
    ]),
    Medicine.find({ pharmacyId, isArchived: { $ne: true } })
      .select('name genericName category strength dosageForm minStockLevel costPrice preferredSupplierId leadTimeDays reorderSafetyDays baseUnit')
      .lean(),
  ]);

  const sold = toMap(salesRows);
  const stock = toMap(stockRows);
  const onOrder = toMap(onOrderRows);

  const items = [];
  for (const med of medicines) {
    const id = String(med._id);
    const soldQty = sold.get(id) || 0;
    const currentStock = stock.get(id) || 0;
    const onOrderQty = onOrder.get(id) || 0;
    const leadTimeDays = Number.isFinite(med.leadTimeDays) ? med.leadTimeDays : 7;
    const safetyDays = Number.isFinite(med.reorderSafetyDays) ? med.reorderSafetyDays : 7;
    const avgDailySales = soldQty / days;
    const targetStock = Math.ceil(avgDailySales * (leadTimeDays + safetyDays));
    const demandQty = targetStock - currentStock - onOrderQty;
    const minStockLevel = Number(med.minStockLevel) || 0;
    const belowMinStock = minStockLevel > 0 && currentStock < minStockLevel;

    if (demandQty <= 0 && !belowMinStock) continue;

    const minTopUp = belowMinStock ? minStockLevel - currentStock - onOrderQty : 0;
    const suggestedQuantity = Math.max(0, demandQty, minTopUp);

    items.push({
      medicineId: med._id,
      name: med.name,
      genericName: med.genericName,
      category: med.category,
      strength: med.strength,
      dosageForm: med.dosageForm,
      baseUnit: med.baseUnit || 'unit',
      unitsSold: soldQty,
      avgDailySales: Number(avgDailySales.toFixed(3)),
      leadTimeDays,
      reorderSafetyDays: safetyDays,
      targetStock,
      currentStock,
      onOrder: onOrderQty,
      minStockLevel,
      belowMinStock,
      suggestedQuantity,
      preferredSupplierId: med.preferredSupplierId || null,
      costPrice: med.costPrice || 0,
    });
  }

  // Default unit cost = last purchase price, else catalog cost price.
  const prices = await lastPurchasePrices(pharmacyId, items.map((i) => i.medicineId));
  for (const it of items) {
    const last = prices.get(String(it.medicineId));
    it.lastPurchasePrice = last || null;
    it.unitCost = last || it.costPrice || 0;
    it.estimatedCost = Number((it.unitCost * it.suggestedQuantity).toFixed(2));
    delete it.costPrice;
  }

  // Group by preferred supplier (ungrouped last).
  const supplierIds = [...new Set(items.filter((i) => i.preferredSupplierId).map((i) => String(i.preferredSupplierId)))];
  const suppliers = supplierIds.length
    ? await Supplier.find({ _id: { $in: supplierIds }, pharmacyId }).select('name phone email isArchived').lean()
    : [];
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));

  const groupsByKey = new Map();
  for (const it of items) {
    const sup = it.preferredSupplierId ? supplierById.get(String(it.preferredSupplierId)) : null;
    const usable = sup && !sup.isArchived ? sup : null;
    if (!usable) it.preferredSupplierId = null;
    const key = usable ? String(usable._id) : 'none';
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        supplier: usable ? { _id: usable._id, name: usable.name, phone: usable.phone, email: usable.email } : null,
        items: [],
        estimatedCost: 0,
      });
    }
    const g = groupsByKey.get(key);
    g.items.push(it);
    g.estimatedCost = Number((g.estimatedCost + it.estimatedCost).toFixed(2));
  }
  const groups = [...groupsByKey.values()].sort((a, b) => {
    if (!a.supplier) return 1;
    if (!b.supplier) return -1;
    return a.supplier.name.localeCompare(b.supplier.name);
  });
  groups.forEach((g) => g.items.sort((a, b) => b.suggestedQuantity - a.suggestedQuantity));

  return { items, groups };
};

// @desc    Reorder suggestions based on recent sales velocity
// @route   GET /api/reorder/suggestions?days=30|60|90
// @access  po:view
const getSuggestions = async (req, res) => {
  const days = req.query.days === undefined ? 30 : parseInt(req.query.days, 10);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new AppError('days must be a whole number between 1 and 365', 400);
  }

  const { items, groups } = await computeSuggestions(req.pharmacyId, days);

  return res.status(200).json({
    success: true,
    days,
    generatedAt: new Date(),
    count: items.length,
    groups,
  });
};

// @desc    Create purchase orders from reorder lines, one per supplier
// @route   POST /api/reorder/create-pos
// @access  po:manage
// Body: { supplierId?, status?: 'draft'|'ordered' (default 'draft'), notes?,
//         lines: [{ medicineId, quantity, unitCost?, supplierId? }] }
// Supplier per line = body.supplierId || line.supplierId || medicine.preferredSupplierId.
const createPurchaseOrders = async (req, res) => {
  const { supplierId, lines, status = 'draft', notes } = req.body || {};

  if (status !== 'draft' && status !== 'ordered') {
    throw new AppError("Status must be 'draft' or 'ordered'", 400);
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError('Please select at least one item to order', 400);
  }
  if (lines.length > MAX_CREATE_LINES) {
    throw new AppError(`At most ${MAX_CREATE_LINES} lines can be ordered at once`, 400);
  }
  if (supplierId !== undefined && supplierId !== null && supplierId !== '' && !isValidId(supplierId)) {
    throw new AppError('Invalid supplier id', 400);
  }

  lines.forEach((l, idx) => {
    if (!l || !isValidId(l.medicineId)) {
      throw new AppError(`Line #${idx + 1} has an invalid or missing medicine`, 400);
    }
    if (l.supplierId && !isValidId(l.supplierId)) {
      throw new AppError(`Line #${idx + 1} has an invalid supplier`, 400);
    }
  });

  const medicines = await Medicine.find({
    _id: { $in: lines.map((l) => l.medicineId) },
    pharmacyId: req.pharmacyId,
    isArchived: { $ne: true },
  })
    .select('name preferredSupplierId costPrice')
    .lean();
  const medById = new Map(medicines.map((m) => [String(m._id), m]));

  const missingSupplier = [];
  const groups = new Map(); // supplierId -> [{ medicineId, quantityOrdered, unitCost }]
  const needPrice = [];
  for (const [idx, l] of lines.entries()) {
    const med = medById.get(String(l.medicineId));
    if (!med) throw new AppError(`Line #${idx + 1}: medicine not found in catalog`, 404);

    const sup = (supplierId || l.supplierId || med.preferredSupplierId || '').toString();
    if (!sup) {
      missingSupplier.push(med.name);
      continue;
    }

    const line = { medicineId: String(med._id), quantityOrdered: Number(l.quantity) };
    if (l.unitCost === undefined || l.unitCost === null || l.unitCost === '') {
      needPrice.push(line);
    } else {
      line.unitCost = Number(l.unitCost);
    }
    if (!groups.has(sup)) groups.set(sup, []);
    groups.get(sup).push(line);
  }

  if (missingSupplier.length) {
    throw new AppError(
      `No supplier selected for: ${missingSupplier.join(', ')}. Choose a supplier or set a preferred supplier on the medicine.`,
      400
    );
  }

  if (needPrice.length) {
    const prices = await lastPurchasePrices(req.pharmacyId, needPrice.map((l) => new mongoose.Types.ObjectId(l.medicineId)));
    for (const line of needPrice) {
      line.unitCost = prices.get(line.medicineId) || medById.get(line.medicineId).costPrice || 0;
    }
  }

  // Validate everything (supplier ownership, quantities, duplicates) before writing.
  const built = [];
  for (const [sup, supLines] of groups) {
    built.push(await buildPurchaseOrderItems(req.pharmacyId, sup, supLines));
  }

  const orders = [];
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      orders.length = 0;
      for (const b of built) {
        orders.push(
          await insertPurchaseOrder(
            {
              pharmacyId: req.pharmacyId,
              userId: req.user._id,
              supplierId: b.supplier._id,
              items: b.items,
              totalAmount: b.totalAmount,
              status,
              notes: typeof notes === 'string' && notes.trim() ? notes.trim() : 'Created from reorder suggestions',
            },
            { session }
          )
        );
      }
    });
  } finally {
    await session.endSession();
  }

  for (const order of orders) {
    await audit(req, {
      action: 'po.create',
      entity: 'PurchaseOrder',
      entityId: order._id,
      after: order,
      meta: { source: 'reorder' },
    });
  }

  await PurchaseOrder.populate(orders, { path: 'supplierId', select: 'name contactPerson phone' });

  return res.status(201).json({
    success: true,
    message: `${orders.length} purchase order${orders.length === 1 ? '' : 's'} created`,
    count: orders.length,
    orders,
  });
};

module.exports = { getSuggestions, createPurchaseOrders, computeSuggestions };
