import api from './axios';

// Cash drawer shifts (#7)
export const getCurrentShift = async () => (await api.get('/shifts/current')).data; // { shift | null, requireShift }
export const openShift = async (data) => (await api.post('/shifts/open', data)).data; // { openingFloat, notes }
export const closeShift = async (id, data) => (await api.post(`/shifts/${id}/close`, data)).data; // { counted, notes }
export const getShifts = async (params = {}) => (await api.get('/shifts', { params })).data;
export const getShift = async (id) => (await api.get(`/shifts/${id}`)).data;
export const getZReport = async (id) => (await api.get(`/shifts/${id}/z-report`)).data;
