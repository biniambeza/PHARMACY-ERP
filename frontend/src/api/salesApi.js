import api from './axios';

export const createSale = async (saleData) => {
  const res = await api.post('/sales', saleData);
  return res.data;
};

export const getSales = async (params = {}) => {
  const res = await api.get('/sales', { params });
  return res.data;
};

export const getSaleById = async (id) => {
  const res = await api.get(`/sales/${id}`);
  return res.data;
};

export const getSalesSummary = async () => {
  const res = await api.get('/sales/summary');
  return res.data;
};
