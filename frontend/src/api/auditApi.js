import api from './axios';

// filters: { userId, action, entity, entityId, from, to, search, page, limit }
export const getAuditLogs = async (filters = {}) => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  const res = await api.get('/audit', { params });
  return res.data;
};

export const getAuditFacets = async () => {
  const res = await api.get('/audit/facets');
  return res.data;
};

export const getAuditLog = async (id) => {
  const res = await api.get(`/audit/${id}`);
  return res.data;
};
