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
