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

// payload: { lines: [{ medicineId, batchNo, expiryDate, quantity, bonusQuantity, unitCost }],
//            supplierInvoiceNo?, supplierInvoiceDate?, notes? }
// Passing an array keeps the legacy behaviour (batchDetails = receive everything outstanding).
export const receivePurchaseOrder = async (id, payload) => {
  const body = Array.isArray(payload) ? { batchDetails: payload } : payload;
  const res = await api.patch(`/procurement/orders/${id}/receive`, body);
  return res.data;
};

export const submitPurchaseOrder = async (id) => {
  const res = await api.patch(`/procurement/orders/${id}/submit`);
  return res.data;
};

export const closePurchaseOrder = async (id, reason = '') => {
  const res = await api.post(`/procurement/orders/${id}/close`, { reason });
  return res.data;
};

export const cancelPurchaseOrder = async (id) => {
  const res = await api.patch(`/procurement/orders/${id}/cancel`);
  return res.data;
};
