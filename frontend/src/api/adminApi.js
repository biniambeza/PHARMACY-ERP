import api from './axios';

export const getSystemStats = async () => {
  const res = await api.get('/admin/stats');
  return res.data;
};

export const getPharmacies = async () => {
  const res = await api.get('/admin/pharmacies');
  return res.data;
};

export const createPharmacy = async (pharmacyData) => {
  const res = await api.post('/admin/pharmacies', pharmacyData);
  return res.data;
};

export const togglePharmacyStatus = async (id) => {
  const res = await api.patch(`/admin/pharmacies/${id}/toggle-status`);
  return res.data;
};

export const deletePharmacy = async (id) => {
  const res = await api.delete(`/admin/pharmacies/${id}`);
  return res.data;
};

// ----- Platform (#24) -----

export const getPlatformMetrics = async (months = 12) => {
  const res = await api.get('/admin/platform/metrics', { params: { months } });
  return res.data;
};

export const getSubscriptions = async () => {
  const res = await api.get('/admin/platform/subscriptions');
  return res.data;
};

// data: { plan?, status?, currentPeriodEnd?, extendDays?, reactivate? }
export const updateSubscription = async (pharmacyId, data) => {
  const res = await api.patch(`/admin/platform/pharmacies/${pharmacyId}/subscription`, data);
  return res.data;
};

export const runSubscriptionCheck = async () => {
  const res = await api.post('/admin/platform/subscriptions/check');
  return res.data;
};

// Read-only support overview of one pharmacy
export const getSupportOverview = async (pharmacyId) => {
  const res = await api.get(`/admin/platform/pharmacies/${pharmacyId}/support`);
  return res.data;
};

// Read-only GET on a tenant endpoint in support mode (x-pharmacy-id)
export const supportGet = async (pharmacyId, path, params = {}) => {
  const res = await api.get(path, { params, headers: { 'x-pharmacy-id': pharmacyId } });
  return res.data;
};
