const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { login, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Brute-force protection: 10 login attempts per 15 minutes per IP.
// Disabled under NODE_ENV=test so the test suite can log in freely.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

router.post('/login', loginLimiter, login);
router.get('/me', protect, getMe);
router.put('/password', protect, changePassword);

module.exports = router;
