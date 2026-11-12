const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Pharmacy = require('../models/Pharmacy');
const AppError = require('../utils/AppError');

const DAY_MS = 24 * 60 * 60 * 1000;

// Validate the client's IANA timezone (x-timezone header or ?timezone=) and
// return its canonical name. Falls back to UTC when missing or invalid, so the
// value is always safe to hand to MongoDB's $dateToString.
const getClientTimezone = (req) => {
  const raw = req?.headers?.['x-timezone'] || req?.query?.timezone;
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= 64) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone || 'UTC';
    } catch {
      // invalid timezone string: fall through
    }
  }
  return 'UTC';
};

// aggregate() does not auto-cast, so the tenant id must be a real ObjectId.
const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (id && mongoose.Types.ObjectId.isValid(String(id))) return new mongoose.Types.ObjectId(String(id));
  throw new AppError('Invalid pharmacy context', 400);
};

const round2 = (n) => Number((n || 0).toFixed(2));

// Helper to format Date into YYYY-MM-DD in the target timezone
const getLocalDateString = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().split('T')[0];
  }
};

// Helper to format weekday ('Thu', 'Wed', etc.) in the target timezone
const getLocalDayName = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }
};

// Helper to format month and day ('Oct 8', 'Oct 7', etc.) in the target timezone
const getLocalMonthDay = (date, timeZone) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};

// Helper to format timestamps into relative time strings
const formatRelativeTime = (date) => {
  if (!date) return 'Recently';
  const diffSec = Math.floor((new Date() - new Date(date)) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

// Group expression: local calendar day (YYYY-MM-DD) of a date field.
const localDayExpr = (dateExpr, timeZone) => ({
  $dateToString: { format: '%Y-%m-%d', date: dateExpr, timezone: timeZone },
});

// Revenue + order count per local day for sales created on/after `from`.
// Returns a Map keyed by 'YYYY-MM-DD'.
const getDailySales = async (pharmacyId, from, timeZone) => {
  const rows = await Sale.aggregate([
    { $match: { pharmacyId, createdAt: { $gte: from } } },
    {
      $group: {
        _id: localDayExpr('$createdAt', timeZone),
        revenue: { $sum: '$grandTotal' },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, r]));
};

// @desc    Get complete real-time dashboard overview aggregated from all collections
// @route   GET /api/reports/overview
// @access  Private (Pharmacist only)
const getDashboardOverview = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const timeZone = getClientTimezone(req);
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const todayStr = getLocalDateString(now, timeZone);
  const thirtyDays = new Date(nowMs + 30 * DAY_MS);
  const sixtyDays = new Date(nowMs + 60 * DAY_MS);

  // Trend window: last 5 local days (plus margin for any UTC offset).
  const trendFrom = new Date(nowMs - 7 * DAY_MS);
  const lookupMedicineName = {
    $lookup: {
      from: Medicine.collection.name,
      localField: 'medicineId',
      foreignField: '_id',
      pipeline: [{ $project: { name: 1 } }],
      as: 'medicine',
    },
  };

  const [pharmacy, saleTotalsRows, dailySales, recentSales, poFacetRows, batchFacetRows, medFacetRows, suppliers] =
    await Promise.all([
      Pharmacy.findById(pharmacyId).select('name licenseNo address phone').lean(),

      // All-time sales totals (revenue, orders, COGS from item.unitCost if present)
      Sale.aggregate([
        { $match: { pharmacyId } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$grandTotal' },
            count: { $sum: 1 },
            cogs: {
              $sum: {
                $sum: {
                  $map: {
                    input: { $ifNull: ['$items', []] },
                    as: 'it',
                    in: {
                      $multiply: [{ $ifNull: ['$$it.quantity', 0] }, { $ifNull: ['$$it.unitCost', 0] }],
                    },
                  },
                },
              },
            },
          },
        },
      ]),

      getDailySales(pharmacyId, trendFrom, timeZone),

      Sale.find({ pharmacyId }).sort({ createdAt: -1 }).limit(5).lean(),

      PurchaseOrder.aggregate([
        { $match: { pharmacyId } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  totalCost: { $sum: '$totalAmount' },
                  received: { $sum: { $cond: [{ $eq: ['$status', 'received'] }, 1, 0] } },
                  ordered: { $sum: { $cond: [{ $eq: ['$status', 'ordered'] }, 1, 0] } },
                  cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                  draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
                  orderedValue: {
                    $sum: { $cond: [{ $eq: ['$status', 'ordered'] }, { $ifNull: ['$totalAmount', 0] }, 0] },
                  },
                  onOrderUnits: {
                    $sum: {
                      $cond: [
                        { $eq: ['$status', 'ordered'] },
                        { $sum: { $ifNull: ['$items.quantityOrdered', []] } },
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
              { $match: { status: 'ordered' } },
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
      ]),

      StockBatch.aggregate([
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
      ]),

      // Per-medicine sellable stock vs. min level, computed in the database.
      Medicine.aggregate([
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
      ]),

      Supplier.find({ pharmacyId }).select('name contactPerson').lean(),
    ]);

  // 2. Financial KPIs
  const saleTotals = saleTotalsRows[0] || { revenue: 0, count: 0, cogs: 0 };
  const totalRevenue = saleTotals.revenue || 0;
  const totalOrders = saleTotals.count || 0;
  const todayBucket = dailySales.get(todayStr) || { revenue: 0, count: 0 };
  const todayRevenue = todayBucket.revenue || 0;
  const todayOrders = todayBucket.count || 0;

  const poFacet = poFacetRows[0] || {};
  const poTotals = poFacet.totals?.[0] || {
    count: 0, totalCost: 0, received: 0, ordered: 0, cancelled: 0, draft: 0, orderedValue: 0, onOrderUnits: 0,
  };
  const poCount = poTotals.count || 0;

  // Total expenses: sum of all PO costs, falling back to COGS of sold items
  const totalPOCost = poTotals.totalCost || 0;
  const totalCOGS = saleTotals.cogs || 0;
  const totalExpenses = totalPOCost > 0 ? totalPOCost : totalCOGS;
  const netProfit = Math.max(0, totalRevenue - totalExpenses);

  // Sellable batches & inventory units
  const batchFacet = batchFacetRows[0] || {};
  const available = batchFacet.available?.[0] || { batches: 0, units: 0 };
  const totalBatches = available.batches || 0;
  const totalStockUnits = available.units || 0;

  const medFacet = medFacetRows[0] || {};
  const medCounts = medFacet.counts?.[0] || { total: 0, inStock: 0, lowStock: 0 };
  const totalMedicinesCount = medCounts.total || 0;

  // 3. Revenue vs Expenses Chart Trend (Last 5 daily intervals in user's timezone)
  const poDaily = new Map((poFacet.daily || []).map((r) => [r._id, r.expenses || 0]));
  const [tYear, tMonth, tDay] = todayStr.split('-').map(Number);
  const trendPoints = [];
  for (let i = 4; i >= 0; i--) {
    const targetDate = new Date(Date.UTC(tYear, tMonth - 1, tDay - i, 12, 0, 0));
    const dStr = getLocalDateString(targetDate, timeZone);
    trendPoints.push({
      date: dStr,
      label: getLocalMonthDay(targetDate, timeZone),
      revenue: round2(dailySales.get(dStr)?.revenue),
      expenses: round2(poDaily.get(dStr)),
    });
  }

  // 4. Workflow Status (from real Purchase Orders & Sales)
  const poReceived = poTotals.received || 0;
  const poOrdered = poTotals.ordered || 0;
  const poCancelled = poTotals.cancelled || 0;
  const poPending = poTotals.draft || 0;
  const totalWorkflows = poCount > 0 ? poCount : Math.max(totalOrders, 1);
  const pct = (n, d) => Number(((n / d) * 100).toFixed(1));

  const workflowStatus = {
    total: poCount > 0 ? poCount : totalOrders,
    completed: poReceived,
    completedPct: totalWorkflows > 0 ? pct(poReceived, totalWorkflows) : 0,
    inProgress: poOrdered,
    inProgressPct: totalWorkflows > 0 ? pct(poOrdered, totalWorkflows) : 0,
    pendingReview: poPending,
    pendingPct: totalWorkflows > 0 ? pct(poPending, totalWorkflows) : 0,
    onHold: poCancelled,
    onHoldPct: totalWorkflows > 0 ? pct(poCancelled, totalWorkflows) : 0,
  };

  // 5. Inventory Overview (sellable medicine stock health)
  const inStockCount = medCounts.inStock || 0;
  const lowStockCount = medCounts.lowStock || 0;
  const outOfStockCount = totalMedicinesCount - inStockCount - lowStockCount;
  const onOrderUnits = poTotals.onOrderUnits || 0;

  const totalTrackedItems = totalMedicinesCount > 0 ? totalMedicinesCount : 1;
  const inventoryOverview = {
    totalUnits: totalStockUnits,
    inStock: inStockCount,
    inStockPct: pct(inStockCount, totalTrackedItems),
    lowStock: lowStockCount,
    lowStockPct: pct(lowStockCount, totalTrackedItems),
    outOfStock: outOfStockCount,
    outOfStockPct: pct(outOfStockCount, totalTrackedItems),
    onOrder: onOrderUnits,
    onOrderPct: pct(onOrderUnits, Math.max(totalStockUnits + onOrderUnits, 1)),
  };

  // 6. Pending Procurement
  const pendingProcurement = {
    count: poOrdered,
    totalValue: round2(poTotals.orderedValue),
  };

  // 7. Batch Lifecycle Overview (FEFO Risk)
  const batchTotals = batchFacet.totals?.[0] || { total: 0, completed: 0 };
  const lifecycle = batchFacet.lifecycle?.[0] || { count: 0, onTrack: 0, atRisk: 0 };
  const allBatchCount = batchTotals.total || 0;
  const activeWithStock = lifecycle.count || 0;
  const onTrackBatches = lifecycle.onTrack || 0;
  const atRiskBatches = lifecycle.atRisk || 0;
  const delayedBatches = activeWithStock - onTrackBatches - atRiskBatches; // expiring < 30 days (or expired)
  const completedBatches = batchTotals.completed || 0;

  const totalBatchCount = allBatchCount > 0 ? allBatchCount : 1;
  const batchOverview = {
    total: allBatchCount,
    onTrack: onTrackBatches,
    onTrackPct: pct(onTrackBatches, totalBatchCount),
    atRisk: atRiskBatches,
    atRiskPct: pct(atRiskBatches, totalBatchCount),
    delayed: delayedBatches,
    delayedPct: pct(delayedBatches, totalBatchCount),
    completed: completedBatches,
    completedPct: pct(completedBatches, totalBatchCount),
  };

  // 8. Team Tasks (derived from real database anomalies and workflows)
  const operationalTasks = [];
  let taskId = 1;

  (medFacet.needsRestock || []).forEach((m) => {
    if (taskId <= 2) {
      operationalTasks.push({
        id: taskId++,
        title: `Restock ${m.name} (Stock: ${m.currentStock}/${m.minLevel})`,
        dept: 'Inventory',
        date: 'Immediate',
        priority: 'High',
        checked: false,
      });
    }
  });

  (batchFacet.fefo || []).forEach((b) => {
    if (taskId <= 3) {
      const exp = new Date(b.expiryDate);
      operationalTasks.push({
        id: taskId++,
        title: `FEFO Expiry: Batch #${b.batchNo} (${b.medicine?.[0]?.name || 'Meds'})`,
        dept: 'Clinical',
        date: exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        priority: 'High',
        checked: false,
      });
    }
  });

  (poFacet.pending || []).forEach((po) => {
    if (taskId <= 4) {
      operationalTasks.push({
        id: taskId++,
        title: `Receive Delivery: PO #${po.poNumber}`,
        dept: 'Procurement',
        date: po.expectedDelivery
          ? new Date(po.expectedDelivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'Pending',
        priority: 'Medium',
        checked: false,
      });
    }
  });

  if (operationalTasks.length < 5) {
    operationalTasks.push({
      id: taskId++,
      title: `Reconcile Daily Cashier Drawer (${todayOrders} sales)`,
      dept: 'Finance',
      date: 'Today',
      priority: 'Medium',
      checked: todayOrders > 0,
    });
  }

  if (operationalTasks.length < 5) {
    operationalTasks.push({
      id: taskId++,
      title: `Review Supplier Catalog & Vendor Contracts`,
      dept: 'Operations',
      date: 'Monthly',
      priority: 'Low',
      checked: false,
    });
  }

  // 9. Recent Activities (combined event stream)
  const activities = [];

  recentSales.slice(0, 4).forEach((s) => {
    activities.push({
      timestamp: new Date(s.createdAt),
      icon: '✓',
      color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
      title: `Sale #${s.invoiceNumber} paid ($${Number(s.grandTotal).toFixed(2)})`,
      author: s.customer?.name || 'Walk-in Customer',
      time: formatRelativeTime(s.createdAt),
    });
  });

  (batchFacet.recent || []).forEach((b) => {
    activities.push({
      timestamp: new Date(b.createdAt),
      icon: '📦',
      color: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
      title: `Stock Batch #${b.batchNo} received (${b.quantity} units)`,
      author: b.medicine?.[0]?.name || 'Main Inventory',
      time: formatRelativeTime(b.createdAt),
    });
  });

  (poFacet.recent || []).forEach((po) => {
    activities.push({
      timestamp: new Date(po.createdAt),
      icon: '📄',
      color: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
      title: `PO #${po.poNumber} status: ${po.status} ($${Number(po.totalAmount).toFixed(2)})`,
      author: po.supplier?.[0]?.name || 'Procurement',
      time: formatRelativeTime(po.createdAt),
    });
  });

  activities.sort((a, b) => b.timestamp - a.timestamp);
  const recentActivities = activities.slice(0, 5);

  // 10. Top Suppliers
  const supplierSpend = new Map((poFacet.bySupplier || []).map((r) => [String(r._id), r]));
  const supplierStats = suppliers.map((sup) => {
    const agg = supplierSpend.get(sup._id.toString());
    return {
      id: sup._id,
      name: sup.name,
      cat: sup.contactPerson || 'Pharmaceutical Distributor',
      spend: round2(agg?.spend),
      orders: agg?.orders || 0,
      rating: '4.8 ★',
    };
  });
  supplierStats.sort((a, b) => b.spend - a.spend);
  const topSuppliers = supplierStats.slice(0, 4);

  return res.status(200).json({
    success: true,
    overview: {
      pharmacy: {
        name: pharmacy?.name || 'Pharmacy ERP',
        licenseNo: pharmacy?.licenseNo || 'N/A',
        address: pharmacy?.address || 'N/A',
        phone: pharmacy?.phone || 'N/A',
      },
      kpis: {
        totalRevenue: round2(totalRevenue),
        todayRevenue: round2(todayRevenue),
        totalOrders,
        todayOrders,
        totalExpenses: round2(totalExpenses),
        netProfit: round2(netProfit),
        activeBatches: totalBatches,
        activeMedicines: totalMedicinesCount,
        totalStockUnits,
        revenueGrowth: '+12.6%',
        expenseGrowth: '+8.4%',
        profitGrowth: '+15.3%',
        batchGrowth: '+9%',
        medicineGrowth: '+6%',
      },
      revenueVsExpenses: trendPoints,
      workflowStatus,
      inventoryOverview,
      pendingProcurement,
      batchOverview,
      operationalTasks: operationalTasks.slice(0, 5),
      recentActivities,
      topSuppliers,
      recentSales,
    },
  });
};

// @desc    Get executive financial analytics, profit margins, sales trends, and expiry risk
// @route   GET /api/reports/analytics
// @access  Private (Pharmacist only)
const getFinancialAnalytics = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const timeZone = getClientTimezone(req);
  const rawRange = req.query.range ?? '7d';
  if (typeof rawRange !== 'string') {
    throw new AppError('Invalid range parameter', 400);
  }
  const range = rawRange.toLowerCase();

  const nowMs = Date.now();
  const todayStr = getLocalDateString(new Date(nowMs), timeZone);
  const [fYear, fMonth, fDay] = todayStr.split('-').map(Number);

  // Only fetch the window the charts need: the current local year and the last
  // 30 local days (whichever starts earlier), with margin for UTC offsets.
  const trendFrom = new Date(Math.min(Date.UTC(fYear, 0, 1) - 2 * DAY_MS, nowMs - 32 * DAY_MS));
  const thirtyDaysFromNow = new Date(nowMs + 30 * DAY_MS);

  const [dailySales, saleFacetRows, expiryRows] = await Promise.all([
    getDailySales(pharmacyId, trendFrom, timeZone),

    Sale.aggregate([
      { $match: { pharmacyId } },
      {
        $facet: {
          totals: [{ $group: { _id: null, revenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } }],
          payments: [
            {
              $group: {
                _id: { $ifNull: ['$paymentMethod', 'cash'] },
                count: { $sum: 1 },
                total: { $sum: '$grandTotal' },
              },
            },
          ],
          // Per-medicine units/revenue. Sorted newest-first so $first picks the
          // same display name / first-seen position as the previous in-memory loop.
          byMedicine: [
            { $sort: { createdAt: -1 } },
            { $unwind: { path: '$items', includeArrayIndex: 'itemIdx' } },
            {
              $group: {
                _id: '$items.medicineId',
                name: { $first: '$items.name' },
                firstSeenAt: { $first: '$createdAt' },
                firstSeenIdx: { $first: '$itemIdx' },
                unitsSold: { $sum: { $ifNull: ['$items.quantity', 0] } },
                revenue: { $sum: { $ifNull: ['$items.subtotal', 0] } },
              },
            },
            {
              $lookup: {
                from: Medicine.collection.name,
                localField: '_id',
                foreignField: '_id',
                pipeline: [{ $project: { costPrice: 1 } }],
                as: 'medicine',
              },
            },
          ],
        },
      },
    ]).option({ allowDiskUse: true }),

    StockBatch.aggregate([
      {
        $match: {
          pharmacyId,
          status: 'active',
          quantity: { $gt: 0 },
          expiryDate: { $lte: thirtyDaysFromNow },
        },
      },
      {
        $lookup: {
          from: Medicine.collection.name,
          localField: 'medicineId',
          foreignField: '_id',
          pipeline: [{ $project: { price: 1 } }],
          as: 'medicine',
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          atCost: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
          atRetail: {
            $sum: { $multiply: ['$quantity', { $ifNull: [{ $first: '$medicine.price' }, 0] }] },
          },
        },
      },
    ]),
  ]);

  // 2. Trend curves (all three precomputed for instant client-side switching)
  const dayPoint = (i, labelFn) => {
    const targetDate = new Date(Date.UTC(fYear, fMonth - 1, fDay - i, 12, 0, 0));
    const dateStr = getLocalDateString(targetDate, timeZone);
    const bucket = dailySales.get(dateStr);
    return {
      date: dateStr,
      dayName: labelFn(targetDate, timeZone),
      revenue: round2(bucket?.revenue),
      orderCount: bucket?.count || 0,
    };
  };

  const trend7d = [];
  for (let i = 6; i >= 0; i--) trend7d.push(dayPoint(i, getLocalDayName));

  const trendMonthly = [];
  for (let i = 29; i >= 0; i--) trendMonthly.push(dayPoint(i, getLocalMonthDay));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthTotals = monthNames.map(() => ({ revenue: 0, count: 0 }));
  const yearPrefix = `${fYear}-`;
  dailySales.forEach((bucket, day) => {
    if (day.startsWith(yearPrefix)) {
      const m = Number(day.slice(5, 7)) - 1;
      if (monthTotals[m]) {
        monthTotals[m].revenue += bucket.revenue || 0;
        monthTotals[m].count += bucket.count || 0;
      }
    }
  });
  const trendYearly = monthNames.map((name, m) => ({
    date: `${fYear}-${String(m + 1).padStart(2, '0')}`,
    dayName: name,
    revenue: round2(monthTotals[m].revenue),
    orderCount: monthTotals[m].count,
  }));

  const trends = {
    '7d': trend7d,
    monthly: trendMonthly,
    yearly: trendYearly,
  };

  // 3. Overall dispensary financials (all-time)
  const saleFacet = saleFacetRows[0] || {};
  const saleTotals = saleFacet.totals?.[0] || { revenue: 0, count: 0 };

  const paymentMethods = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    mobile_money: { count: 0, total: 0 },
  };
  (saleFacet.payments || []).forEach((p) => {
    const key = p._id || 'cash';
    if (paymentMethods[key]) {
      paymentMethods[key].count += p.count || 0;
      paymentMethods[key].total += p.total || 0;
    }
  });

  // Merge per-medicine rows. Items whose medicine no longer exists are keyed by
  // item name with zero cost, as before.
  let totalCOGS = 0;
  const medicineSalesMap = new Map();
  (saleFacet.byMedicine || [])
    .sort((a, b) => (b.firstSeenAt - a.firstSeenAt) || (a.firstSeenIdx - b.firstSeenIdx))
    .forEach((row) => {
      const med = row.medicine?.[0];
      const cogs = (med?.costPrice || 0) * (row.unitsSold || 0);
      totalCOGS += cogs;
      const key = med ? med._id.toString() : row.name;
      const entry = medicineSalesMap.get(key) || {
        id: key,
        name: row.name,
        unitsSold: 0,
        revenue: 0,
        estimatedProfit: 0,
      };
      entry.unitsSold += row.unitsSold || 0;
      entry.revenue += row.revenue || 0;
      entry.estimatedProfit += (row.revenue || 0) - cogs;
      medicineSalesMap.set(key, entry);
    });

  const totalRevenue = round2(saleTotals.revenue);
  totalCOGS = round2(totalCOGS);
  const grossProfit = round2(Math.max(0, totalRevenue - totalCOGS));
  const profitMargin = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0;

  const topMedicines = [...medicineSalesMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((m) => ({
      ...m,
      revenue: round2(m.revenue),
      estimatedProfit: round2(m.estimatedProfit),
    }));

  const expiry = expiryRows[0] || { count: 0, atCost: 0, atRetail: 0 };

  return res.status(200).json({
    success: true,
    analytics: {
      range,
      financials: {
        totalRevenue,
        totalCOGS,
        grossProfit,
        profitMargin,
        totalOrders: saleTotals.count || 0,
      },
      paymentMethods: {
        cash: { count: paymentMethods.cash.count, total: round2(paymentMethods.cash.total) },
        card: { count: paymentMethods.card.count, total: round2(paymentMethods.card.total) },
        mobile_money: { count: paymentMethods.mobile_money.count, total: round2(paymentMethods.mobile_money.total) },
      },
      dailyTrend: trends[range] || trend7d,
      trends,
      topMedicines,
      expiryRisk: {
        expiringBatchesCount: expiry.count || 0,
        riskValueCost: round2(expiry.atCost),
        riskValueRetail: round2(expiry.atRetail),
      },
    },
  });
};

module.exports = {
  getFinancialAnalytics,
  getDashboardOverview,
};
