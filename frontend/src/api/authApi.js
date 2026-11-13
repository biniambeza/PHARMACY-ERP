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

// Platform admin: turn off a user's two-factor login (also signs them out everywhere).
export const adminResetUserTwoFactor = async (userId) => {
  const res = await api.post(`/auth/admin-reset-2fa/${userId}`);
  return res.data;
};

// ---- Two-factor login (TOTP) for the signed-in user
// { enabled, enabledAt, recoveryCodesRemaining, recommended }
export const getTwoFactorStatus = async () => {
  const res = await api.get('/auth/2fa/status');
  return res.data;
};

// { secret, otpauthUrl, qrCode (PNG data URL), issuer }
export const startTwoFactorSetup = async (password) => {
  const res = await api.post('/auth/2fa/setup', { password });
  return res.data;
};

// { recoveryCodes: string[] } (shown once)
export const enableTwoFactor = async (code) => {
  const res = await api.post('/auth/2fa/enable', { code });
  return res.data;
};

// body { password, code } or { password, recoveryCode }
export const disableTwoFactor = async (body) => {
  const res = await api.post('/auth/2fa/disable', body);
  return res.data;
};

export const regenerateRecoveryCodes = async (password, code) => {
  const res = await api.post('/auth/2fa/recovery-codes', { password, code });
  return res.data;
};
