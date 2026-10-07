import api from './axios';

export const getFinancialAnalytics = async (range = '7d') => {
  const res = await api.get(`/reports/analytics?range=${range}`);
  return res.data;
};

export const getDashboardOverview = async () => {
  const res = await api.get('/reports/overview');
  return res.data;
};
