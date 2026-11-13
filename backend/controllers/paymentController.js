// Mobile money payment intents (#26). Owner: POS agent.
const mongoose = require('mongoose');
const PaymentIntent = require('../models/PaymentIntent');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { getProvider, listProviders, defaultProviderName, verifyWebhookSecret } = require('../services/payments');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const publicIntent = (i) => ({
  _id: i._id,
  provider: i.provider,
  amount: i.amount,
  currency: i.currency,
  phone: i.phone,
  reference: i.reference,
  providerRef: i.providerRef,
  status: i.status,
  failureReason: i.failureReason,
  confirmedAt: i.confirmedAt,
  saleId: i.saleId,
  createdAt: i.createdAt,
});

// @route GET /api/payments/providers
const getProviders = async (req, res) =>
  res.status(200).json({ success: true, default: defaultProviderName(), providers: listProviders() });

// @route POST /api/payments/intents  { amount, provider?, phone?, reference? }
// 'manual' -> confirmed immediately (reference required); push providers -> pending until the webhook.
const createIntent = async (req, res) => {
  const amount = round2(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Amount must be a positive number', 400);
  if (amount > 1e8) throw new AppError('Amount is too large', 400);
  const provider = getProvider(req.body?.provider);
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim().slice(0, 30) : '';
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';

  if (provider.name === 'manual' && reference) {
    const dup = await PaymentIntent.findOne({
      pharmacyId: req.pharmacyId,
      provider: 'manual',
      reference,
      status: 'confirmed',
    }).select('_id saleId');
    if (dup && dup.saleId) throw new AppError('This transaction reference was already used for another sale', 400);
  }

  const result = await provider.initiate({
    amount,
    currency: req.pharmacy?.settings?.currency || 'ETB',
    phone,
    reference,
  });

  const intent = await PaymentIntent.create({
    pharmacyId: req.pharmacyId,
    provider: provider.name,
    amount,
    currency: req.pharmacy?.settings?.currency || 'ETB',
    phone,
    reference: result.reference || reference,
    providerRef: result.providerRef,
    status: result.status,
    confirmedAt: result.status === 'confirmed' ? new Date() : null,
    createdBy: req.user._id,
  });

  return res.status(201).json({ success: true, intent: publicIntent(intent) });
};

// @route GET /api/payments/intents/:id
const getIntent = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Payment not found', 404);
  const intent = await PaymentIntent.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!intent) throw new AppError('Payment not found', 404);
  return res.status(200).json({ success: true, intent: publicIntent(intent) });
};

// @route POST /api/payments/intents/:id/cancel
const cancelIntent = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Payment not found', 404);
  const intent = await PaymentIntent.findOneAndUpdate(
    { _id: req.params.id, pharmacyId: req.pharmacyId, status: 'pending', saleId: null },
    { $set: { status: 'cancelled' } },
    { returnDocument: 'after' }
  );
  if (!intent) throw new AppError('Only pending payments can be cancelled', 400);
  return res.status(200).json({ success: true, intent: publicIntent(intent) });
};

// @route POST /api/payments/webhook/:provider   (public; header x-webhook-secret)
const handleWebhook = async (req, res) => {
  const providerName = String(req.params.provider || '').toLowerCase();
  if (!verifyWebhookSecret(providerName, req.headers)) {
    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  }
  const provider = getProvider(providerName);
  const event = provider.parseWebhook(req.body || {});

  const intent = await PaymentIntent.findOne({ provider: provider.name, providerRef: event.providerRef });
  if (!intent) throw new AppError('Payment not found', 404);

  // Idempotent: a webhook for an intent that is no longer pending changes nothing
  if (intent.status !== 'pending') {
    return res.status(200).json({ success: true, status: intent.status, unchanged: true });
  }
  if (event.status === 'confirmed' && event.amount !== undefined && Number.isFinite(event.amount)
    && event.amount < intent.amount - 0.005) {
    event.status = 'failed';
    event.reason = 'Amount paid is lower than requested';
  }

  const set =
    event.status === 'confirmed'
      ? { status: 'confirmed', confirmedAt: new Date(), ...(event.reference ? { reference: event.reference } : {}) }
      : { status: 'failed', failureReason: event.reason || 'Payment failed' };
  const updated = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: 'pending' },
    { $set: set },
    { returnDocument: 'after' }
  );

  await audit(null, {
    pharmacyId: intent.pharmacyId,
    action: `payment.${event.status}`,
    entity: 'PaymentIntent',
    entityId: intent._id,
    meta: { provider: provider.name, providerRef: event.providerRef, amount: intent.amount },
  });

  return res.status(200).json({ success: true, status: updated ? updated.status : intent.status });
};

module.exports = { getProviders, createIntent, getIntent, cancelIntent, handleWebhook };
