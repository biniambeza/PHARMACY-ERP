// reportController.js split into cohesive modules; this index keeps the original export surface.
const financeReports = require('./financeReports');
const dashboard = require('./dashboard');
const salesReports = require('./salesReports');
const inventoryReports = require('./inventoryReports');
const helpers = require('./helpers');
const aggregates = require('./aggregates');

module.exports = {
  getFinancialAnalytics: financeReports.getFinancialAnalytics,
  getDashboardOverview: dashboard.getDashboardOverview,
  getProfitReport: financeReports.getProfitReport,
  getSalesByStaff: salesReports.getSalesByStaff,
  getSalesByShift: salesReports.getSalesByShift,
  getSlowMovingStock: inventoryReports.getSlowMovingStock,
  getExpiryLoss: inventoryReports.getExpiryLoss,
  getTaxSummary: salesReports.getTaxSummary,
  getPeriodComparison: financeReports.getPeriodComparison,
  // exported for tests / other modules
  parseRange: helpers.parseRange,
  getPeriodSummary: aggregates.getPeriodSummary,
};
