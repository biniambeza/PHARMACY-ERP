import api from './axios';

export const getMyPharmacy = async () => {
  const res = await api.get('/pharmacy/my-pharmacy');
  return res.data;
};

export const updateMyPharmacy = async (pharmacyData) => {
  const res = await api.put('/pharmacy/my-pharmacy', pharmacyData);
  return res.data;
};

export const updateProfile = async (profileData) => {
  const res = await api.put('/pharmacy/profile', profileData);
  return res.data;
};
