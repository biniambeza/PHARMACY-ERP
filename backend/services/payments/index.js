// Mobile money provider abstraction (#26). Owner: POS agent.
//
//   getProvider(name?) -> provider (defaults to env MOBILE_MONEY_PROVIDER || 'manual')
//   listProviders()    -> [{ name, label, configured, flow: 'manual'|'push' }]
//   verifyWebhookSecret(providerName, headers) -> boolean
//
// Provider interface:
//   name, label, flow
//   isConfigured() -> boolean
//   initiate({ amount, currency, phone, reference, intentId }) ->
//       { status: 'confirmed'|'pending', reference, providerRef }
//   parseWebhook(body) -> { providerRef, status: 'confirmed'|'failed', reference?, amount?, reason? }
//
// 'manual': the cashier takes the payment on the customer's phone and types the
// transaction reference; the intent is confirmed immediately.
// 'telebirr' / 'mpesa': push-payment adapters driven by env vars
// (<PREFIX>_API_KEY, <PREFIX>_BASE_URL, <PREFIX>_WEBHOOK_SECRET). They throw
// "not configured" (503) when the API key is missing. The HTTP call to the real
// provider API is intentionally a stub: initiate() returns a pending intent with a
// generated providerRef, and the provider's webhook confirms it.
const crypto = require('crypto');
const AppError = require('../../utils/AppError');

const manualProvider = {
  name: 'manual',
  label: 'Manual (enter reference)',
  flow: 'manual',
  isConfigured: () => true,
  initiate: async ({ reference }) => {
    const ref = typeof reference === 'string' ? reference.trim() : '';
    if (!ref) throw new AppError('A transaction reference is required for mobile money payments', 400);
    if (ref.length > 100) throw new AppError('Transaction reference is too long', 400);
    return { status: 'confirmed', reference: ref, providerRef: undefined };
  },
  parseWebhook: () => {
    throw new AppError('The manual provider has no webhook', 400);
  },
};

const createPushProvider = ({ name, label, envPrefix }) => {
  const env = (key) => (process.env[`${envPrefix}_${key}`] || '').trim();
  return {
    name,
    label,
    flow: 'push',
    envPrefix,
    isConfigured: () => Boolean(env('API_KEY')),
    initiate: async ({ amount, phone }) => {
      if (!env('API_KEY')) {
        throw new AppError(`Mobile money provider "${name}" is not configured`, 503);
      }
      if (!phone || !/^\+?[0-9]{7,15}$/.test(String(phone).replace(/[\s-]/g, ''))) {
        throw new AppError('A valid customer phone number is required', 400);
      }
      if (!(Number(amount) > 0)) throw new AppError('Amount must be positive', 400);
      // Stub: a real adapter would POST to `${env('BASE_URL')}` with the API key here
      // and return the provider's transaction id.
      const providerRef = `${name.toUpperCase()}-${crypto.randomBytes(8).toString('hex')}`;
      return { status: 'pending', reference: providerRef, providerRef };
    },
    // Generic webhook payload: { providerRef | transactionId, status: 'success'|'confirmed'|'failed', reference?, amount? }
    parseWebhook: (body = {}) => {
      const providerRef = String(body.providerRef || body.transactionId || '').trim();
      if (!providerRef) throw new AppError('providerRef is required', 400);
      const raw = String(body.status || '').toLowerCase();
      let status;
      if (['success', 'succeeded', 'confirmed', 'completed', 'paid'].includes(raw)) status = 'confirmed';
      else if (['failed', 'cancelled', 'canceled', 'expired', 'rejected'].includes(raw)) status = 'failed';
      else throw new AppError('Unknown payment status', 400);
      return {
        providerRef,
        status,
        reference: typeof body.reference === 'string' ? body.reference.trim().slice(0, 100) : '',
        amount: body.amount !== undefined ? Number(body.amount) : undefined,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 300) : '',
      };
    },
    webhookSecret: () => env('WEBHOOK_SECRET') || (process.env.PAYMENT_WEBHOOK_SECRET || '').trim(),
  };
};

const PROVIDERS = {
  manual: manualProvider,
  telebirr: createPushProvider({ name: 'telebirr', label: 'telebirr', envPrefix: 'TELEBIRR' }),
  mpesa: createPushProvider({ name: 'mpesa', label: 'M-PESA', envPrefix: 'MPESA' }),
};

const defaultProviderName = () => {
  const n = (process.env.MOBILE_MONEY_PROVIDER || 'manual').trim().toLowerCase();
  return PROVIDERS[n] ? n : 'manual';
};

const getProvider = (name) => {
  const key = (name ? String(name) : defaultProviderName()).trim().toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) throw new AppError(`Unknown mobile money provider "${name}"`, 400);
  return provider;
};

const listProviders = () =>
  Object.values(PROVIDERS).map((p) => ({
    name: p.name,
    label: p.label,
    flow: p.flow,
    configured: p.isConfigured(),
  }));

// Constant-time comparison of the shared secret header (x-webhook-secret).
const verifyWebhookSecret = (providerName, headers = {}) => {
  const provider = PROVIDERS[String(providerName || '').toLowerCase()];
  if (!provider || typeof provider.webhookSecret !== 'function') return false;
  const expected = provider.webhookSecret();
  const given = String(headers['x-webhook-secret'] || '');
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { getProvider, listProviders, defaultProviderName, verifyWebhookSecret, PROVIDERS };
