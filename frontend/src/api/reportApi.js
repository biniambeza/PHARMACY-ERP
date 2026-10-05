import api from './axios';

export const getFinancialAnalytics = async () => {
  const res = await api.get('/reports/analytics');
  return res.data;
};
