import api from './axios';

export const getMedicines = async (params = {}) => {
  const res = await api.get('/medicines', { params });
  return res.data;
};

export const getMedicineById = async (id) => {
  const res = await api.get(`/medicines/${id}`);
  return res.data;
};

export const createMedicine = async (medicineData) => {
  const res = await api.post('/medicines', medicineData);
  return res.data;
};

export const updateMedicine = async (id, medicineData) => {
  const res = await api.put(`/medicines/${id}`, medicineData);
  return res.data;
};

export const deleteMedicine = async (id) => {
  const res = await api.delete(`/medicines/${id}`);
  return res.data;
};

export const getCategories = async () => {
  const res = await api.get('/medicines/categories');
  return res.data;
};

// Barcode / pack barcode / SKU lookup -> { medicine, unit: { name, factor, price } }
export const lookupMedicine = async (code) => {
  const res = await api.get('/medicines/lookup', { params: { code } });
  return res.data;
};

export const generateBarcode = async (id, packUnitId) => {
  const res = await api.post(`/medicines/${id}/generate-barcode`, packUnitId ? { packUnitId } : {});
  return res.data;
};

export const getPriceHistory = async (id, params = {}) => {
  const res = await api.get(`/medicines/${id}/price-history`, { params });
  return res.data;
};

// body: { filter: { category?, ids?, all? }, mode: 'percent'|'set', value, roundTo?, reason, field? }
export const previewBulkPrice = async (body) => {
  const res = await api.post('/medicines/bulk-price/preview', body);
  return res.data;
};

export const applyBulkPrice = async (body) => {
  const res = await api.post('/medicines/bulk-price', body);
  return res.data;
};
