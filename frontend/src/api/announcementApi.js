import api from './axios';

// Announcements for the current pharmacy (tenant side)
export const getActiveAnnouncements = async () => {
  const res = await api.get('/announcements/active');
  return res.data;
};

// Platform admin management
export const getAnnouncements = async () => {
  const res = await api.get('/admin/platform/announcements');
  return res.data;
};

// data: { title, message, severity, audience: 'all' | [pharmacyId], startsAt?, endsAt? }
export const createAnnouncement = async (data) => {
  const res = await api.post('/admin/platform/announcements', data);
  return res.data;
};

export const updateAnnouncement = async (id, data) => {
  const res = await api.put(`/admin/platform/announcements/${id}`, data);
  return res.data;
};

export const deleteAnnouncement = async (id) => {
  const res = await api.delete(`/admin/platform/announcements/${id}`);
  return res.data;
};
