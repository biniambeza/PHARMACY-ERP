const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Return = require('../models/Return');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { audit } = require('../utils/audit');
const { processSale, contextFromRequest } = require('../services/sales');

const toMoney = (n) => Number(Number(n).toFixed(2));
const MAX_SYNC_BATCH = 50;

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

const SALE_POPULATE = [
  { path: 'pharmacistId', select: 'name email' },
  { path: 'staffId', select: 'name email' },
  { path: 'customerId', select: 'name phone balance creditLimit' },
  { path: 'patientId', select: 'name phone' },
  { path: 'prescriptionId', select: 'number prescriberName' },
  { path: 'shiftId', select: 'shiftNumber status' },
];

// staffId stays an id in the create response (API compatibility); the receipt falls
// back to the populated pharmacistId (same user) for the "served by" name.
const populateSale = (sale) =>
  Sale.findById(sale._id).populate(SALE_POPULATE.filter((p) => p.path !== 'staffId'));

// Sends an AppError that carries a machine-readable `code` (e.g. SHIFT_REQUIRED)
// with that code; everything else goes to the central error handler.
const sendCoded = (res, err) => {
  if (err && err.isOperational && typeof err.code === 'string') {
    return res.status(err.status || 400).json({ success: false, code: err.code, message: err.message });
  }
  throw err;
};

// @desc    Process new sale (FEFO stock deduction, pack units, tax, split payments,
//          credit, clinical checks, shift, offline idempotency). See services/sales.js.
// @route   POST /api/sales
// @access  sales:create
const createSale = async (req, res) => {
  let result;
  try {
    result = await processSale(contextFromRequest(req), req.body || {});
  } catch (err) {
    return sendCoded(res, err);
  }
  const sale = await populateSale(result.sale);

  if (!result.duplicate && (sale.balanceDue > 0 || sale.discount > 0)) {
    await audit(req, {
      action: 'sale.create',
      entity: 'Sale',
      entityId: sale._id,
      meta: {
        invoiceNumber: sale.invoiceNumber,
        grandTotal: sale.grandTotal,
        discount: sale.discount,
        credit: sale.balanceDue,
      },
    });
  }

  return res.status(result.duplicate ? 200 : 201).json({
    success: true,
    duplicate: result.duplicate,
    message: result.duplicate ? 'Sale was already recorded' : 'Sale completed successfully',
    sale,
  });
};

// @desc    Sync sales made while the POS was offline. Each sale is processed on its own
//          (idempotent by offlineId); failures are reported per item, not for the batch.
// @route   POST /api/sales/sync   body: { sales: [{ offlineId, payload, createdAtClient }] }
// @access  sales:create
const syncOfflineSales = async (req, res) => {
  const list = req.body?.sales;
  if (!Array.isArray(list) || list.length === 0) {
    throw new AppError('sales must be a non-empty array', 400);
  }
  if (list.length > MAX_SYNC_BATCH) {
    throw new AppError(`At most ${MAX_SYNC_BATCH} sales can be synced at once`, 400);
  }

  const ctx = contextFromRequest(req);
  const results = [];
  for (const entry of list) {
    const offlineId = typeof entry?.offlineId === 'string' ? entry.offlineId.trim() : '';
    if (!offlineId || offlineId.length > 100) {
      results.push({ offlineId: offlineId || null, status: 'failed', message: 'offlineId is required' });
      continue;
    }
    try {
      const payload = {
        ...(entry.payload && typeof entry.payload === 'object' ? entry.payload : {}),
        offlineId,
        createdAtClient: entry.createdAtClient,
      };
      const { sale, duplicate } = await processSale(ctx, payload, { offline: true });
      results.push({
        offlineId,
        status: duplicate ? 'duplicate' : 'created',
        saleId: sale._id,
        invoiceNumber: sale.invoiceNumber,
        grandTotal: sale.grandTotal,
      });
    } catch (err) {
      if (!err || !err.isOperational) {
        if (process.env.NODE_ENV !== 'test') console.error('[sales.sync]', err);
      }
      results.push({
        offlineId,
        status: 'failed',
        code: (err && typeof err.code === 'string' && err.code) || (err && err.status === 409 ? 'CONFLICT' : 'REJECTED'),
        message: err && err.isOperational ? err.message : 'Could not process this sale',
      });
    }
  }

  const summary = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    { created: 0, duplicate: 0, failed: 0 }
  );

  if (summary.created > 0 || summary.failed > 0) {
    await audit(req, { action: 'sale.offline_sync', entity: 'Sale', meta: summary });
  }

  return res.status(200).json({ success: true, summary, results });
};

// @desc    Catalog for the POS: sellable medicines with their sellable stock (base units).
//          Also used to fill the offline cache.
// @route   GET /api/sales/pos-catalog
// @access  sales:create
const getPosCatalog = async (req, res) => {
  const now = new Date();
  const [medicines, stock] = await Promise.all([
    Medicine.find({ pharmacyId: req.pharmacyId, isArchived: { $ne: true } })
      .select(
        'name genericName category dosageForm strength price barcode sku baseUnit packUnits ' +
          'requiresPrescription isControlled taxExempt'
      )
      .sort({ name: 1 })
      .limit(10000)
      .lean(),
    StockBatch.aggregate([
      {
        $match: {
          pharmacyId: new mongoose.Types.ObjectId(String(req.pharmacyId)),
          status: 'active',
          quantity: { $gt: 0 },
          expiryDate: { $gt: now },
        },
      },
      { $group: { _id: '$medicineId', stock: { $sum: '$quantity' }, nextExpiry: { $min: '$expiryDate' } } },
    ]),
  ]);
  const byMed = new Map(stock.map((s) => [String(s._id), s]));
  const items = medicines.map((m) => ({
    ...m,
    stock: byMed.get(String(m._id))?.stock || 0,
    nextExpiry: byMed.get(String(m._id))?.nextExpiry || null,
  }));
  return res.status(200).json({ success: true, generatedAt: now, count: items.length, medicines: items });
};

// @desc    Top-selling medicines (quick-pick grid)
// @route   GET /api/sales/top-items?days=30&limit=12
// @access  sales:create
const getTopItems = async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await Sale.aggregate([
    {
      $match: {
        pharmacyId: new mongoose.Types.ObjectId(String(req.pharmacyId)),
        createdAt: { $gte: since },
        voided: { $ne: true },
      },
    },
    { $unwind: '$items' },
    { $group: { _id: '$items.medicineId', quantity: { $sum: '$items.quantity' }, sales: { $addToSet: '$_id' } } },
    { $project: { quantity: 1, salesCount: { $size: '$sales' } } },
    { $sort: { salesCount: -1, quantity: -1 } },
    { $limit: limit },
  ]);
  return res.status(200).json({
    success: true,
    items: rows.map((r) => ({ medicineId: r._id, quantity: r.quantity, salesCount: r.salesCount })),
  });
};

// @desc    Get sales history for logged-in pharmacy
// @route   GET /api/sales
// @access  sales:view
const getSales = async (req, res) => {
  const { search, limit = 50, page = 1 } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (typeof search === 'string' && search.trim()) {
    const sanitized = escapeRegex(search.trim());
    query.$or = [
      { invoiceNumber: { $regex: sanitized, $options: 'i' } },
      { 'customer.name': { $regex: sanitized, $options: 'i' } },
      { 'customer.phone': { $regex: sanitized, $options: 'i' } },
    ];
  }
  if (typeof req.query.shiftId === 'string' && mongoose.isValidObjectId(req.query.shiftId)) {
    query.shiftId = req.query.shiftId;
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
// @access  sales:view
const getSaleById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Sale transaction not found', 404);
  const sale = await Sale.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  })
    .populate(SALE_POPULATE)
    .populate('items.medicineId', 'name genericName category dosageForm strength');

  if (!sale) {
    throw new AppError('Sale transaction not found', 404);
  }

  return res.status(200).json({
    success: true,
    sale,
  });
};

// @desc    Get sales statistics for dashboard (voided sales excluded, returns subtracted)
// @route   GET /api/sales/summary
// @access  sales:view
const getSalesSummary = async (req, res) => {
  const timeZone = resolveTimeZone(req.headers['x-timezone']);
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const pharmacyId = new mongoose.Types.ObjectId(String(req.pharmacyId));
  const isTodayExpr = {
    $eq: [{ $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: timeZone } }, todayStr],
  };

  const [[result], [returns]] = await Promise.all([
    Sale.aggregate([
      { $match: { pharmacyId, voided: { $ne: true } } },
      { $project: { grandTotal: { $ifNull: ['$grandTotal', 0] }, isToday: isTodayExpr } },
      {
        $group: {
          _id: null,
          totalSalesCount: { $sum: 1 },
          totalRevenue: { $sum: '$grandTotal' },
          todaySalesCount: { $sum: { $cond: ['$isToday', 1, 0] } },
          todayRevenue: { $sum: { $cond: ['$isToday', '$grandTotal', 0] } },
        },
      },
    ]),
    Return.aggregate([
      { $match: { pharmacyId } },
      { $project: { refundTotal: { $ifNull: ['$refundTotal', 0] }, isToday: isTodayExpr } },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: '$refundTotal' },
          todayRefunds: { $sum: { $cond: ['$isToday', '$refundTotal', 0] } },
        },
      },
    ]),
  ]);

  const totalRefunds = returns?.totalRefunds || 0;
  const todayRefunds = returns?.todayRefunds || 0;

  return res.status(200).json({
    success: true,
    summary: {
      todaySalesCount: result?.todaySalesCount || 0,
      todayRevenue: toMoney((result?.todayRevenue || 0) - todayRefunds),
      totalSalesCount: result?.totalSalesCount || 0,
      totalRevenue: toMoney((result?.totalRevenue || 0) - totalRefunds),
      todayRefunds: toMoney(todayRefunds),
      totalRefunds: toMoney(totalRefunds),
    },
  });
};

module.exports = {
  createSale,
  syncOfflineSales,
  getPosCatalog,
  getTopItems,
  getSales,
  getSaleById,
  getSalesSummary,
};
