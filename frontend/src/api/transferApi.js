import api from './axios';

// Stock transfers between branches (#23). The active branch (x-pharmacy-id) is
// the source when sending and the destination when receiving.

export const getTransfers = async (params = {}) => {
  const res = await api.get('/transfers', { params });
  return res.data;
};

export const getTransfer = async (id) => {
  const res = await api.get(`/transfers/${id}`);
  return res.data;
};

export const getTransferDestinations = async () => {
  const res = await api.get('/transfers/destinations');
  return res.data;
};

// data: { toPharmacyId, lines: [{ medicineId, batchId?, quantity }], notes?, draft? }
export const createTransfer = async (data) => {
  const res = await api.post('/transfers', data);
  return res.data;
};

export const sendTransfer = async (id) => {
  const res = await api.post(`/transfers/${id}/send`);
  return res.data;
};

export const receiveTransfer = async (id) => {
  const res = await api.post(`/transfers/${id}/receive`);
  return res.data;
};

export const cancelTransfer = async (id, reason = '') => {
  const res = await api.post(`/transfers/${id}/cancel`, { reason });
  return res.data;
};

export const getConsolidatedReport = async (params = {}) => {
  const res = await api.get('/transfers/consolidated', { params });
  return res.data;
};
