const Sale = require('../../models/Sale');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const PurchaseOrder = require('../../models/PurchaseOrder');
const Supplier = require('../../models/Supplier');
const Pharmacy = require('../../models/Pharmacy');
const { DAY_MS, toObjectId, round2, getLocalDateString, getLocalMonthDay, formatRelativeTime, parseRange } = require('./helpers');
const { getPeriodSummary, buildComparison, formatGrowth, getDailySales, rangeMeta } = require('./aggregates');
const { poOverviewPipeline, batchOverviewPipeline, medicineStockPipeline } = require('./dashboardPipelines');

// @desc    Get complete real-time dashboard overview aggregated from all collections
// @route   GET /api/reports/overview
// @access  Private (Pharmacist only)
const getDashboardOverview = async (req, res) => {
  const pharmacyId = toObjectId(req.pharmacyId);
  const period = parseRange(req, '7d');
  const { timeZone } = period;
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const todayStr = getLocalDateString(now, timeZone);
  const thirtyDays = new Date(nowMs + 30 * DAY_MS);
  const sixtyDays = new Date(nowMs + 60 * DAY_MS);

  // Trend window: last 5 local days (plus margin for any UTC offset).
  const trendFrom = new Date(nowMs - 7 * DAY_MS);

  const [
    pharmacy, allTime, periodSummary, prevSummary, dailySales, recentSales, poFacetRows, batchFacetRows, medFacetRows, suppliers,
  ] =
    await Promise.all([
      Pharmacy.findById(pharmacyId).select('name licenseNo address phone settings').lean(),

      // All-time totals (net of voids and returns, COGS from actual costs)
      getPeriodSummary(pharmacyId, null, null),
      // Selected period and the previous comparable period
      getPeriodSummary(pharmacyId, period.range === 'all' ? null : period.from, period.to),
      period.prevFrom ? getPeriodSummary(pharmacyId, period.prevFrom, period.prevTo) : Promise.resolve(null),

      getDailySales(pharmacyId, trendFrom, timeZone),

      Sale.find({ pharmacyId }).sort({ createdAt: -1 }).limit(5).lean(),

      PurchaseOrder.aggregate(poOverviewPipeline({ pharmacyId, trendFrom, timeZone })),

      StockBatch.aggregate(batchOverviewPipeline({ pharmacyId, now, thirtyDays, sixtyDays })),

      // Per-medicine sellable stock vs. min level, computed in the database.
      Medicine.aggregate(medicineStockPipeline({ pharmacyId, now })),

      Supplier.find({ pharmacyId }).select('name contactPerson').lean(),
    ]);

  // 2. Financial KPIs (all-time totals keep their names; period values live in kpis.period)
  const totalRevenue = allTime.revenue;
  const totalOrders = allTime.orders;
  const todayBucket = dailySales.get(todayStr) || { revenue: 0, count: 0 };
  const todayRevenue = todayBucket.revenue || 0;
  const todayOrders = todayBucket.count || 0;

  const poFacet = poFacetRows[0] || {};
  const poTotals = poFacet.totals?.[0] || {
    count: 0, totalCost: 0, received: 0, ordered: 0, cancelled: 0, draft: 0, orderedValue: 0, onOrderUnits: 0,
  };
  const poCount = poTotals.count || 0;

  // Expenses = cost of goods sold (actual batch costs); profit = net revenue - COGS.
  const totalPOCost = poTotals.totalCost || 0;
  const totalCOGS = allTime.cogs;
  const totalExpenses = totalCOGS;
  const netProfit = allTime.grossProfit;
  const comparison = buildComparison(periodSummary, prevSummary);

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
      title: `Sale #${s.invoiceNumber} ${s.voided ? 'voided' : 'paid'} (${Number(s.grandTotal).toFixed(2)})`,
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
      title: `PO #${po.poNumber} status: ${po.status} (${Number(po.totalAmount).toFixed(2)})`,
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
        totalCOGS: round2(totalCOGS),
        totalPurchaseCost: round2(totalPOCost),
        totalRefunds: allTime.refunds,
        // Growth of the selected period vs the previous one
        revenueGrowth: formatGrowth(comparison.revenue.changePct),
        expenseGrowth: formatGrowth(comparison.cogs.changePct),
        profitGrowth: formatGrowth(comparison.grossProfit.changePct),
        period: { ...rangeMeta(period), ...periodSummary },
        allTime,
      },
      comparison,
      currency: pharmacy?.settings?.currency || 'ETB',
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

module.exports = {
  getDashboardOverview,
};
