import api from './axios';

// Public: always resolves with a generic message (does not reveal accounts).
export const requestPasswordReset = async (email) => {
  const res = await api.post('/auth/forgot-password', { email });
  return res.data;
};

export const resetPasswordWithToken = async (token, password) => {
  const res = await api.post('/auth/reset-password', { token, password });
  return res.data;
};

// Platform admin: mode 'temp' returns { tempPassword }, mode 'email' sends a reset link.
export const adminResetUserPassword = async (userId, mode = 'temp') => {
  const res = await api.post(`/auth/admin-reset/${userId}`, { mode });
  return res.data;
};
