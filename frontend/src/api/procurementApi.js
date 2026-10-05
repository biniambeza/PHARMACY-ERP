import api from './axios';

export const getPurchaseOrders = async (params = {}) => {
  const res = await api.get('/procurement/orders', { params });
  return res.data;
};

export const getPurchaseOrderById = async (id) => {
  const res = await api.get(`/procurement/orders/${id}`);
  return res.data;
};

export const createPurchaseOrder = async (orderData) => {
  const res = await api.post('/procurement/orders', orderData);
  return res.data;
};

export const receivePurchaseOrder = async (id, batchDetails) => {
  const res = await api.patch(`/procurement/orders/${id}/receive`, { batchDetails });
  return res.data;
};

export const cancelPurchaseOrder = async (id) => {
  const res = await api.patch(`/procurement/orders/${id}/cancel`);
  return res.data;
};
