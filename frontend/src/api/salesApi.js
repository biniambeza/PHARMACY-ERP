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

// Offline sync: sales = [{ offlineId, payload, createdAtClient }] -> { summary, results: [{ offlineId, status, ... }] }
export const syncSales = async (sales) => {
  const res = await api.post('/sales/sync', { sales });
  return res.data;
};

// Sellable medicines with stock (base units) for POS search and the offline cache
export const getPosCatalog = async () => {
  const res = await api.get('/sales/pos-catalog');
  return res.data;
};

// Top-selling medicines for the quick-pick grid -> { items: [{ medicineId, quantity, salesCount }] }
export const getTopItems = async (params = {}) => {
  const res = await api.get('/sales/top-items', { params });
  return res.data;
};
