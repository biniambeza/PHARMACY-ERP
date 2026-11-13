import api from './axios';

// params: { medicineId, batchId, type, userId, from, to, page, limit }
export const getMovements = async (params = {}) => (await api.get('/movements', { params })).data;
