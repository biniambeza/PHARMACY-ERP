import api from './axios';

// GET /reorder/suggestions?days=30|60|90 -> { days, count, groups: [{ supplier, items, estimatedCost }] }
export const getReorderSuggestions = async (days = 30) => {
  const res = await api.get('/reorder/suggestions', { params: { days } });
  return res.data;
};

// payload: { supplierId?, status?: 'draft'|'ordered', lines: [{ medicineId, quantity, unitCost?, supplierId? }] }
export const createReorderPOs = async (payload) => {
  const res = await api.post('/reorder/create-pos', payload);
  return res.data;
};
