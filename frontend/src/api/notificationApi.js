import api from './axios';

// GET /api/notifications?page&limit&unread&type&severity
export const getNotifications = async (params = {}) => {
  const res = await api.get('/notifications', { params });
  return res.data;
};

export const getUnreadCount = async () => {
  const res = await api.get('/notifications/unread-count');
  return res.data;
};

export const markNotificationRead = async (id) => {
  const res = await api.patch(`/notifications/${id}/read`);
  return res.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.post('/notifications/read-all');
  return res.data;
};

// Owner only (settings:manage): run the expiry / low stock / overdue PO checks now.
export const runNotificationChecks = async () => {
  const res = await api.post('/notifications/run-checks', {});
  return res.data;
};

export const getExpiryOverview = async () => {
  const res = await api.get('/notifications/expiry-overview');
  return res.data;
};
