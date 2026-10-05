const Sale = require('../models/Sale');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');

// @desc    Get executive financial analytics, profit margins, sales trends, and expiry risk
// @route   GET /api/reports/analytics
// @access  Private (Pharmacist only)
const getFinancialAnalytics = async (req, res) => {
  try {
    const pharmacyId = req.pharmacyId;

    // 1. Fetch all sales for this pharmacy
    const sales = await Sale.find({ pharmacyId })
      .populate('items.medicineId', 'name costPrice price category')
      .sort({ createdAt: -1 });

    let totalRevenue = 0;
    let totalCOGS = 0; // Cost of Goods Sold
    const paymentMethods = {
      cash: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      mobile_money: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
    };

    const medicineSalesMap = {};

    sales.forEach((sale) => {
      totalRevenue += sale.grandTotal;

      // Payment method aggregation
      const pm = sale.paymentMethod || 'cash';
      if (paymentMethods[pm]) {
        paymentMethods[pm].count += 1;
        paymentMethods[pm].total += sale.grandTotal;
      }

      // COGS and Top selling medicines calculation
      sale.items.forEach((item) => {
        const medCost = item.medicineId?.costPrice || 0;
        const itemCOGS = medCost * item.quantity;
        totalCOGS += itemCOGS;

        const medId = item.medicineId?._id?.toString() || item.name;
        if (!medicineSalesMap[medId]) {
          medicineSalesMap[medId] = {
            id: medId,
            name: item.name,
            unitsSold: 0,
            revenue: 0,
            estimatedProfit: 0,
          };
        }
        medicineSalesMap[medId].unitsSold += item.quantity;
        medicineSalesMap[medId].revenue += item.subtotal;
        medicineSalesMap[medId].estimatedProfit += (item.subtotal - itemCOGS);
      });
    });

    totalRevenue = Number(totalRevenue.toFixed(2));
    totalCOGS = Number(totalCOGS.toFixed(2));
    const grossProfit = Number(Math.max(0, totalRevenue - totalCOGS).toFixed(2));
    const profitMargin = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0;

    // Top 5 selling medicines
    const topMedicines = Object.values(medicineSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((m) => ({
        ...m,
        revenue: Number(m.revenue.toFixed(2)),
        estimatedProfit: Number(m.estimatedProfit.toFixed(2)),
      }));

    // 2. Daily Sales Trend (Last 7 Days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const daySales = sales.filter((s) => s.createdAt.toISOString().split('T')[0] === dateStr);
      const dayRev = daySales.reduce((sum, s) => sum + s.grandTotal, 0);

      last7Days.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        revenue: Number(dayRev.toFixed(2)),
        orderCount: daySales.length,
      });
    }

    // 3. Expiry Risk Analysis (Batches expiring within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const activeBatches = await StockBatch.find({
      pharmacyId,
      status: 'active',
      quantity: { $gt: 0 },
    }).populate('medicineId', 'name price');

    const expiringBatches = activeBatches.filter(
      (b) => new Date(b.expiryDate) <= thirtyDaysFromNow
    );

    const expiryRiskAtCost = expiringBatches.reduce(
      (sum, b) => sum + b.quantity * (b.purchasePrice || 0),
      0
    );

    const expiryRiskAtRetail = expiringBatches.reduce(
      (sum, b) => sum + b.quantity * (b.medicineId?.price || 0),
      0
    );

    return res.status(200).json({
      success: true,
      analytics: {
        financials: {
          totalRevenue,
          totalCOGS,
          grossProfit,
          profitMargin,
          totalOrders: sales.length,
        },
        paymentMethods: {
          cash: { count: paymentMethods.cash.count, total: Number(paymentMethods.cash.total.toFixed(2)) },
          card: { count: paymentMethods.card.count, total: Number(paymentMethods.card.total.toFixed(2)) },
          mobile_money: { count: paymentMethods.mobile_money.count, total: Number(paymentMethods.mobile_money.total.toFixed(2)) },
        },
        dailyTrend: last7Days,
        topMedicines,
        expiryRisk: {
          expiringBatchesCount: expiringBatches.length,
          riskValueCost: Number(expiryRiskAtCost.toFixed(2)),
          riskValueRetail: Number(expiryRiskAtRetail.toFixed(2)),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getFinancialAnalytics,
};
