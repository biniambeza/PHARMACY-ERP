import api from './axios';

export const getSuppliers = async (params = {}) => {
  const res = await api.get('/suppliers', { params });
  return res.data;
};

export const getSupplierById = async (id) => {
  const res = await api.get(`/suppliers/${id}`);
  return res.data;
};

export const createSupplier = async (supplierData) => {
  const res = await api.post('/suppliers', supplierData);
  return res.data;
};

export const updateSupplier = async (id, supplierData) => {
  const res = await api.put(`/suppliers/${id}`, supplierData);
  return res.data;
};

export const deleteSupplier = async (id) => {
  const res = await api.delete(`/suppliers/${id}`);
  return res.data;
};
