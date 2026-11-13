// reportController.js split into cohesive modules; this index keeps the original export surface.
// Every report handler is wrapped so a MongoDB time-out (maxTimeMS) becomes a friendly 503.
const financeReports = require('./financeReports');
const dashboard = require('./dashboard');
const salesReports = require('./salesReports');
const inventoryReports = require('./inventoryReports');
const helpers = require('./helpers');
const aggregates = require('./aggregates');

const { withReportTimeout } = helpers;

module.exports = {
  getFinancialAnalytics: withReportTimeout(financeReports.getFinancialAnalytics),
  getDashboardOverview: withReportTimeout(dashboard.getDashboardOverview),
  getProfitReport: withReportTimeout(financeReports.getProfitReport),
  getSalesByStaff: withReportTimeout(salesReports.getSalesByStaff),
  getSalesByShift: withReportTimeout(salesReports.getSalesByShift),
  getSlowMovingStock: withReportTimeout(inventoryReports.getSlowMovingStock),
  getExpiryLoss: withReportTimeout(inventoryReports.getExpiryLoss),
  getTaxSummary: withReportTimeout(salesReports.getTaxSummary),
  getPeriodComparison: withReportTimeout(financeReports.getPeriodComparison),
  // exported for tests / other modules
  parseRange: helpers.parseRange,
  getPeriodSummary: aggregates.getPeriodSummary,
};
