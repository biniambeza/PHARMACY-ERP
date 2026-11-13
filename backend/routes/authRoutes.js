const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const {
  login,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  adminResetPassword,
  loginTwoFactor,
  twoFactorStatus,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  twoFactorRegenerateRecoveryCodes,
  adminResetTwoFactor,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Brute-force protection, per IP. Disabled under NODE_ENV=test so the test
// suite can call these endpoints freely.
const makeLimiter = (limit, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { success: false, message },
  });

// 10 login attempts per 15 minutes per IP.
const loginLimiter = makeLimiter(10, 'Too many login attempts. Please try again in 15 minutes.');
// Password reset emails / token attempts.
const forgotLimiter = makeLimiter(5, 'Too many password reset requests. Please try again in 15 minutes.');
const resetLimiter = makeLimiter(10, 'Too many password reset attempts. Please try again in 15 minutes.');
// Second login step (6-digit codes / recovery codes).
const twoFactorLoginLimiter = makeLimiter(10, 'Too many verification attempts. Please try again in 15 minutes.');
// 2FA management (password + code checks while signed in).
const twoFactorManageLimiter = makeLimiter(20, 'Too many attempts. Please try again in 15 minutes.');

router.post('/login', loginLimiter, login);
router.post('/login/2fa', twoFactorLoginLimiter, loginTwoFactor);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);
router.get('/me', protect, getMe);
router.put('/password', protect, changePassword);
router.post('/admin-reset/:userId', protect, authorize('admin'), adminResetPassword);
router.post('/admin-reset-2fa/:userId', protect, authorize('admin'), adminResetTwoFactor);

// Two-factor login (TOTP) for the signed-in user
router.get('/2fa/status', protect, twoFactorStatus);
router.post('/2fa/setup', protect, twoFactorManageLimiter, twoFactorSetup);
router.post('/2fa/enable', protect, twoFactorManageLimiter, twoFactorEnable);
router.post('/2fa/disable', protect, twoFactorManageLimiter, twoFactorDisable);
router.post('/2fa/recovery-codes', protect, twoFactorManageLimiter, twoFactorRegenerateRecoveryCodes);

module.exports = router;
