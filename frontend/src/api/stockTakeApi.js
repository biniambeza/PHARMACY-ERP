import api from './axios';

export const getStockTakes = async (params = {}) => (await api.get('/stock-takes', { params })).data;
export const getStockTake = async (id) => (await api.get(`/stock-takes/${id}`)).data;
export const getVarianceReport = async (id) => (await api.get(`/stock-takes/${id}/variance`)).data;
export const startStockTake = async (body) => (await api.post('/stock-takes', body)).data;
// counts: [{ lineId | batchId, countedQty | null }]
export const saveStockTakeCounts = async (id, counts) => (await api.patch(`/stock-takes/${id}/counts`, { counts })).data;
export const submitStockTake = async (id) => (await api.post(`/stock-takes/${id}/submit`)).data;
export const reopenStockTake = async (id) => (await api.post(`/stock-takes/${id}/reopen`)).data;
export const approveStockTake = async (id) => (await api.post(`/stock-takes/${id}/approve`)).data;
export const cancelStockTake = async (id) => (await api.post(`/stock-takes/${id}/cancel`)).data;
