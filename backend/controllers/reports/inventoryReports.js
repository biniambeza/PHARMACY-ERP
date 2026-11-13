const Sale = require('../../models/Sale');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const StockMovement = require('../../models/StockMovement');
const AppError = require('../../utils/AppError');
const { DAY_MS, toObjectId, round2, localMonthExpr, parseRange } = require('./helpers');
const { rangeMeta } = require('./aggregates');

// @desc    Slow-moving and dead stock: medicines in stock with no sales (dead)
//          or very low sales (slow) during the last N days, with stock value.
// @route   GET /api/reports/slow-moving?days=90&status=all|dead|slow
// @access  Private (reports:view)
const getSlowMovingStock = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const days = req.query.days === undefined ? 90 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new AppError('days must be a whole number between 1 and 3650', 400);
  }
  const statusFilter = ['dead', 'slow'].includes(req.query.status) ? req.query.status : 'all';
  const cutoff = new Date(Date.now() - days * DAY_MS);

  const [stockRows, salesRows] = await Promise.all([
    Medicine.aggregate([
      { $match: { pharmacyId, isArchived: { $ne: true } } },
      { $project: { name: 1, category: 1, price: 1, costPrice: 1 } },
      {
        $lookup: {
          from: StockBatch.collection.name,
          localField: '_id',
          foreignField: 'medicineId',
          let: { medCost: '$costPrice' },
          pipeline: [
            { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 } } },
            {
              $group: {
                _id: null,
                qty: { $sum: '$quantity' },
                batches: { $sum: 1 },
                value: {
                  $sum: {
                    $multiply: [
                      '$quantity',
                      { $cond: [{ $gt: [{ $ifNull: ['$purchasePrice', 0] }, 0] }, '$purchasePrice', { $ifNull: ['$$medCost', 0] }] },
                    ],
                  },
                },
                oldestReceived: { $min: '$createdAt' },
                nearestExpiry: { $min: '$expiryDate' },
              },
            },
          ],
          as: 'stock',
        },
      },
      { $addFields: { stock: { $first: '$stock' } } },
      { $match: { 'stock.qty': { $gt: 0 } } },
    ]),
    Sale.aggregate([
      { $match: { pharmacyId, voided: { $ne: true } } },
      { $project: { createdAt: 1, items: { medicineId: 1, quantity: 1 } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.medicineId',
          lastSoldAt: { $max: '$createdAt' },
          unitsInWindow: { $sum: { $cond: [{ $gte: ['$createdAt', cutoff] }, '$items.quantity', 0] } },
        },
      },
    ]).option({ allowDiskUse: true }),
  ]);

  const salesMap = new Map(salesRows.map((r) => [String(r._id), r]));
  const now = Date.now();
  const rows = [];
  stockRows.forEach((m) => {
    const sale = salesMap.get(String(m._id));
    const lastSoldAt = sale?.lastSoldAt || null;
    const unitsInWindow = sale?.unitsInWindow || 0;
    const qty = m.stock.qty;
    let status = null;
    let coverDays = null;
    if (!lastSoldAt || lastSoldAt < cutoff) {
      status = 'dead';
    } else {
      coverDays = Math.round(qty / (unitsInWindow / days));
      // Slow: current stock lasts more than 3x the window at the recent sales rate
      if (coverDays > days * 3) status = 'slow';
    }
    if (!status || (statusFilter !== 'all' && status !== statusFilter)) return;
    rows.push({
      medicineId: m._id,
      name: m.name,
      category: m.category,
      status,
      quantity: qty,
      batches: m.stock.batches,
      stockValue: round2(m.stock.value),
      retailValue: round2(qty * (m.price || 0)),
      lastSoldAt,
      daysSinceLastSale: lastSoldAt ? Math.floor((now - new Date(lastSoldAt).getTime()) / DAY_MS) : null,
      unitsSoldInWindow: unitsInWindow,
      coverDays,
      nearestExpiry: m.stock.nearestExpiry,
      oldestReceived: m.stock.oldestReceived,
    });
  });
  rows.sort((a, b) => b.stockValue - a.stockValue);

  const summary = rows.reduce(
    (s, r) => {
      s[r.status].count += 1;
      s[r.status].stockValue = round2(s[r.status].stockValue + r.stockValue);
      return s;
    },
    { dead: { count: 0, stockValue: 0 }, slow: { count: 0, stockValue: 0 } }
  );

  return res.status(200).json({ success: true, report: { days, status: statusFilter, summary, rows } });
};

const EXPIRE_MOVEMENTS = ['expire', 'adjust_expired'];

// @desc    Expiry loss: value (at cost) of stock written off as expired, by month,
//          plus expired stock still on the shelf (not yet written off).
// @route   GET /api/reports/expiry-loss?range=yearly...
// @access  Private (reports:view)
const getExpiryLoss = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, 'yearly');
  const { timeZone } = period;
  const periodFrom = period.range === 'all' ? null : period.from;
  const dateMatch = {};
  if (periodFrom) dateMatch.$gte = periodFrom;
  dateMatch.$lt = period.to;

  const costStages = [
    {
      $lookup: {
        from: StockBatch.collection.name,
        localField: 'batchId',
        foreignField: '_id',
        pipeline: [{ $project: { purchasePrice: 1, batchNo: 1 } }],
        as: '_batch',
      },
    },
    {
      $lookup: {
        from: Medicine.collection.name,
        localField: 'medicineId',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, costPrice: 1 } }],
        as: '_med',
      },
    },
    {
      $addFields: {
        _units: { $abs: '$quantityChange' },
        _unitCost: {
          $cond: [
            { $gt: [{ $ifNull: [{ $first: '$_batch.purchasePrice' }, 0] }, 0] },
            { $first: '$_batch.purchasePrice' },
            { $ifNull: [{ $first: '$_med.costPrice' }, 0] },
          ],
        },
      },
    },
    { $addFields: { _value: { $multiply: ['$_units', '$_unitCost'] } } },
  ];

  const [movementFacet, writtenOffBatchIds, onShelf] = await Promise.all([
    StockMovement.aggregate([
      { $match: { pharmacyId, type: { $in: EXPIRE_MOVEMENTS }, quantityChange: { $lt: 0 }, createdAt: dateMatch } },
      ...costStages,
      {
        $facet: {
          byMonth: [
            {
              $group: {
                _id: localMonthExpr('$createdAt', timeZone),
                units: { $sum: '$_units' },
                value: { $sum: '$_value' },
                batches: { $addToSet: '$batchId' },
              },
            },
            { $project: { units: 1, value: 1, batches: { $size: '$batches' } } },
            { $sort: { _id: 1 } },
          ],
          byMedicine: [
            {
              $group: {
                _id: '$medicineId',
                name: { $first: { $first: '$_med.name' } },
                units: { $sum: '$_units' },
                value: { $sum: '$_value' },
              },
            },
            { $sort: { value: -1 } },
            { $limit: 20 },
          ],
        },
      },
    ]),
    StockMovement.distinct('batchId', { pharmacyId, type: { $in: EXPIRE_MOVEMENTS } }),
    StockBatch.aggregate([
      { $match: { pharmacyId, quantity: { $gt: 0 }, expiryDate: { $lt: new Date() }, status: { $in: ['active', 'expired'] } } },
      {
        $lookup: {
          from: Medicine.collection.name,
          localField: 'medicineId',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, costPrice: 1 } }],
          as: '_med',
        },
      },
      {
        $group: {
          _id: null,
          batches: { $sum: 1 },
          units: { $sum: '$quantity' },
          value: {
            $sum: {
              $multiply: [
                '$quantity',
                {
                  $cond: [
                    { $gt: [{ $ifNull: ['$purchasePrice', 0] }, 0] },
                    '$purchasePrice',
                    { $ifNull: [{ $first: '$_med.costPrice' }, 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]),
  ]);

  // Batches marked 'expired' without any expire movement (e.g. legacy data):
  // count their expiry month using the quantity they were marked with.
  const statusOnly = await StockBatch.aggregate([
    {
      $match: {
        pharmacyId,
        status: 'expired',
        expiryDate: dateMatch,
        _id: { $nin: writtenOffBatchIds },
        quantity: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: localMonthExpr('$expiryDate', timeZone),
        units: { $sum: '$quantity' },
        value: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
        batches: { $sum: 1 },
      },
    },
  ]);

  const months = new Map();
  [...(movementFacet[0]?.byMonth || []), ...statusOnly].forEach((r) => {
    const m = months.get(r._id) || { month: r._id, units: 0, value: 0, batches: 0 };
    m.units += r.units || 0;
    m.value += r.value || 0;
    m.batches += r.batches || 0;
    months.set(r._id, m);
  });
  const byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, value: round2(m.value) }));
  const shelf = onShelf[0] || { batches: 0, units: 0, value: 0 };

  return res.status(200).json({
    success: true,
    report: {
      ...rangeMeta(period),
      byMonth,
      byMedicine: (movementFacet[0]?.byMedicine || []).map((r) => ({
        medicineId: r._id, name: r.name || 'Unknown', units: r.units, value: round2(r.value),
      })),
      totals: {
        units: byMonth.reduce((s, m) => s + m.units, 0),
        value: round2(byMonth.reduce((s, m) => s + m.value, 0)),
        batches: byMonth.reduce((s, m) => s + m.batches, 0),
      },
      expiredOnShelf: { batches: shelf.batches, units: shelf.units, value: round2(shelf.value) },
    },
  });
};

module.exports = {
  getSlowMovingStock,
  getExpiryLoss,
};
