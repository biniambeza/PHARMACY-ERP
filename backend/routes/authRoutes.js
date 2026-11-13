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

router.post('/login', loginLimiter, login);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password', resetLimiter, resetPassword);
router.get('/me', protect, getMe);
router.put('/password', protect, changePassword);
router.post('/admin-reset/:userId', protect, authorize('admin'), adminResetPassword);

module.exports = router;
