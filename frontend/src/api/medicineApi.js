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
