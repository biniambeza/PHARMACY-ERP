// Mounted at /api/payments/webhook (public, no JWT): mobile money provider callbacks (#26).
// Authenticated by the shared secret header `x-webhook-secret`
// (<PROVIDER>_WEBHOOK_SECRET or PAYMENT_WEBHOOK_SECRET). Owner: POS agent.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { handleWebhook } = require('../controllers/paymentController');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/:provider', limiter, handleWebhook);

module.exports = router;
