import api from './axios';

// Sales returns, refunds and voids (#2)

export const getReturns = async (params = {}) => {
  const res = await api.get('/returns', { params });
  return res.data;
};

export const getReturnById = async (id) => {
  const res = await api.get(`/returns/${id}`);
  return res.data;
};

// payload: { saleId, items: [{ saleItemId, quantity, disposition }], reason, refundMethod }
export const createReturn = async (payload) => {
  const res = await api.post('/returns', payload);
  return res.data;
};

export const voidSale = async (saleId, reason) => {
  const res = await api.post(`/returns/void/${saleId}`, { reason });
  return res.data;
};
