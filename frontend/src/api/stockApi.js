import api from './axios';

export const getStockBatches = async (params = {}) => {
  const res = await api.get('/stock', { params });
  return res.data;
};

export const addStockBatch = async (batchData) => {
  const res = await api.post('/stock', batchData);
  return res.data;
};

export const adjustStock = async (id, adjustmentData) => {
  const res = await api.patch(`/stock/${id}/adjust`, adjustmentData);
  return res.data;
};

export const getInventorySummary = async () => {
  const res = await api.get('/stock/summary');
  return res.data;
};

export const deleteStockBatch = async (id) => {
  const res = await api.delete(`/stock/${id}`);
  return res.data;
};
