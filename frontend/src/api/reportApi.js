import api from './axios';

// Range: '7d' or { range: 'today'|'7d'|'monthly'|'yearly'|'all'|'custom', from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
const rangeParams = (range) => {
  if (!range) return {};
  if (typeof range === 'string') return { range };
  const { range: r, from, to } = range;
  return r === 'custom' ? { range: r, from, to } : { range: r };
};

export const getFinancialAnalytics = async (range = '7d') => {
  const res = await api.get('/reports/analytics', { params: rangeParams(range) });
  return res.data;
};

export const getDashboardOverview = async (range = '7d') => {
  const res = await api.get('/reports/overview', { params: rangeParams(range) });
  return res.data;
};

export const getProfitReport = async (range, groupBy = 'medicine') => {
  const res = await api.get('/reports/profit', { params: { ...rangeParams(range), groupBy } });
  return res.data;
};

export const getSalesByStaff = async (range) => {
  const res = await api.get('/reports/sales-by-staff', { params: rangeParams(range) });
  return res.data;
};

export const getSalesByShift = async (range) => {
  const res = await api.get('/reports/sales-by-shift', { params: rangeParams(range) });
  return res.data;
};

export const getSlowMovingStock = async (days = 90, status = 'all') => {
  const res = await api.get('/reports/slow-moving', { params: { days, status } });
  return res.data;
};

export const getExpiryLoss = async (range) => {
  const res = await api.get('/reports/expiry-loss', { params: rangeParams(range) });
  return res.data;
};

export const getTaxSummary = async (range, groupBy) => {
  const res = await api.get('/reports/tax-summary', { params: { ...rangeParams(range), ...(groupBy ? { groupBy } : {}) } });
  return res.data;
};

export const getPeriodComparison = async (range) => {
  const res = await api.get('/reports/comparison', { params: rangeParams(range) });
  return res.data;
};
