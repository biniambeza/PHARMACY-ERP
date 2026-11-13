const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const Supplier = require('../../models/Supplier');
const { OPEN_PO_STATUSES, localDayExpr } = require('./helpers');

// Aggregation pipelines used by the dashboard overview (getDashboardOverview).

const lookupMedicineName = {
  $lookup: {
    from: Medicine.collection.name,
    localField: 'medicineId',
    foreignField: '_id',
    pipeline: [{ $project: { name: 1 } }],
    as: 'medicine',
  },
};

// Purchase order totals, daily spend, spend per supplier, pending and recent orders.
const poOverviewPipeline = ({ pharmacyId, trendFrom, timeZone }) => [
  { $match: { pharmacyId } },
  {
    $facet: {
      totals: [
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            // Committed purchase value (drafts and cancelled orders excluded)
            totalCost: {
              $sum: { $cond: [{ $in: ['$status', ['draft', 'cancelled']] }, 0, { $ifNull: ['$totalAmount', 0] }] },
            },
            // received + closed (closed short) count as completed
            received: { $sum: { $cond: [{ $in: ['$status', ['received', 'closed']] }, 1, 0] } },
            // ordered + partially_received are still in progress
            ordered: { $sum: { $cond: [{ $in: ['$status', OPEN_PO_STATUSES] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            // Value still to be delivered: order total minus what was already received
            orderedValue: {
              $sum: {
                $cond: [
                  { $in: ['$status', OPEN_PO_STATUSES] },
                  {
                    $max: [
                      0,
                      {
                        $subtract: [
                          { $ifNull: ['$totalAmount', 0] },
                          { $sum: { $ifNull: ['$receipts.totalCost', []] } },
                        ],
                      },
                    ],
                  },
                  0,
                ],
              },
            },
            onOrderUnits: {
              $sum: {
                $cond: [
                  { $in: ['$status', OPEN_PO_STATUSES] },
                  {
                    $max: [
                      0,
                      {
                        $subtract: [
                          { $sum: { $ifNull: ['$items.quantityOrdered', []] } },
                          { $sum: { $ifNull: ['$items.quantityReceived', []] } },
                        ],
                      },
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      ],
      daily: [
        { $addFields: { _poDate: { $ifNull: ['$createdAt', '$orderDate'] } } },
        { $match: { _poDate: { $gte: trendFrom } } },
        { $group: { _id: localDayExpr('$_poDate', timeZone), expenses: { $sum: '$totalAmount' } } },
      ],
      bySupplier: [
        { $group: { _id: '$supplierId', spend: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ],
      pending: [
        { $match: { status: { $in: OPEN_PO_STATUSES } } },
        { $sort: { createdAt: -1 } },
        { $limit: 4 },
        { $project: { poNumber: 1, expectedDelivery: 1 } },
      ],
      recent: [
        { $sort: { createdAt: -1 } },
        { $limit: 3 },
        {
          $lookup: {
            from: Supplier.collection.name,
            localField: 'supplierId',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1 } }],
            as: 'supplier',
          },
        },
        { $project: { poNumber: 1, status: 1, totalAmount: 1, createdAt: 1, supplier: 1 } },
      ],
    },
  },
];

// Batch totals, lifecycle (expiry) buckets, sellable stock, FEFO risk and recent batches.
const batchOverviewPipeline = ({ pharmacyId, now, thirtyDays, sixtyDays }) => [
  { $match: { pharmacyId } },
  {
    $facet: {
      totals: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $or: [{ $eq: ['$quantity', 0] }, { $eq: ['$status', 'depleted'] }] }, 1, 0] },
            },
          },
        },
      ],
      // Lifecycle buckets over every active batch with stock, including
      // expired-but-active lots (they fall under "delayed").
      lifecycle: [
        { $match: { status: 'active', quantity: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            onTrack: { $sum: { $cond: [{ $gt: ['$expiryDate', sixtyDays] }, 1, 0] } },
            atRisk: {
              $sum: {
                $cond: [
                  { $and: [{ $lte: ['$expiryDate', sixtyDays] }, { $gt: ['$expiryDate', thirtyDays] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ],
      // Sellable stock: active, in stock and not yet expired.
      available: [
        { $match: { status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
        { $group: { _id: null, batches: { $sum: 1 }, units: { $sum: '$quantity' } } },
      ],
      fefo: [
        { $match: { status: 'active', quantity: { $gt: 0 }, expiryDate: { $lte: thirtyDays } } },
        { $sort: { _id: 1 } },
        { $limit: 3 },
        lookupMedicineName,
        { $project: { batchNo: 1, expiryDate: 1, medicine: 1 } },
      ],
      recent: [
        { $sort: { createdAt: -1 } },
        { $limit: 3 },
        lookupMedicineName,
        { $project: { batchNo: 1, quantity: 1, createdAt: 1, medicine: 1 } },
      ],
    },
  },
];

// Per-medicine sellable stock vs. min level, computed in the database.
const medicineStockPipeline = ({ pharmacyId, now }) => [
  { $match: { pharmacyId } },
  { $project: { name: 1, minStockLevel: 1 } },
  {
    $lookup: {
      from: StockBatch.collection.name,
      localField: '_id',
      foreignField: 'medicineId',
      pipeline: [
        { $match: { pharmacyId, status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
        { $group: { _id: null, qty: { $sum: '$quantity' } } },
      ],
      as: 'stock',
    },
  },
  {
    $addFields: {
      currentStock: { $ifNull: [{ $first: '$stock.qty' }, 0] },
      // mirrors `m.minStockLevel || 10`
      minLevel: {
        $cond: [{ $in: [{ $ifNull: ['$minStockLevel', 0] }, [0]] }, 10, '$minStockLevel'],
      },
    },
  },
  {
    $facet: {
      counts: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            inStock: { $sum: { $cond: [{ $gt: ['$currentStock', '$minLevel'] }, 1, 0] } },
            lowStock: {
              $sum: {
                $cond: [
                  { $and: [{ $lte: ['$currentStock', '$minLevel'] }, { $gt: ['$currentStock', 0] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ],
      needsRestock: [
        { $match: { $expr: { $lte: ['$currentStock', '$minLevel'] } } },
        { $sort: { _id: 1 } },
        { $limit: 2 },
        { $project: { name: 1, currentStock: 1, minLevel: 1 } },
      ],
    },
  },
];

module.exports = { poOverviewPipeline, batchOverviewPipeline, medicineStockPipeline };
