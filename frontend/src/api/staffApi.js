import api from './axios';

export const getStaff = async () => {
  const res = await api.get('/staff');
  return res.data;
};

export const createStaff = async (data) => {
  const res = await api.post('/staff', data);
  return res.data;
};

export const changeStaffRole = async (userId, role) => {
  const res = await api.patch(`/staff/${userId}/role`, { role });
  return res.data;
};

export const deactivateStaff = async (userId) => {
  const res = await api.patch(`/staff/${userId}/deactivate`);
  return res.data;
};

export const reactivateStaff = async (userId) => {
  const res = await api.patch(`/staff/${userId}/reactivate`);
  return res.data;
};
