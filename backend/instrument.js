// Optional error tracking with Sentry (@sentry/node).
//
// Zero effect unless SENTRY_DSN is set, and never active under NODE_ENV=test.
// server.js requires this file FIRST (before express / mongoose are loaded) so
// Sentry's auto-instrumentation can hook into them.
//
// Privacy: no request bodies, cookies, Authorization headers, query strings,
// IP addresses, local variables or anything that looks like a password/token
// is sent. Only unexpected / 5xx errors are reported; operational 4xx errors
// (AppError, validation, cast, duplicate key, CORS...) are not.
//
// Env:
//   SENTRY_DSN                  enable reporting (unset = disabled)
//   SENTRY_ENVIRONMENT          default NODE_ENV or 'development'
//   SENTRY_RELEASE              default RENDER_GIT_COMMIT or package.json version
//   SENTRY_TRACES_SAMPLE_RATE   0..1, default 0 (performance tracing off)
// The environment must already be loaded (server.js calls dotenv first).
const { toHttpError } = require('./middleware/errorHandler');

let Sentry = null; // loaded lazily so tests / unconfigured installs never load the SDK

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|session|otp|pin|api[-_]?key|card|cvv/i;
const REDACTED = '[redacted]';

const isConfigured = (env = process.env) => Boolean((env.SENTRY_DSN || '').trim()) && env.NODE_ENV !== 'test';

// Only unexpected errors / 5xx are worth reporting.
const shouldReport = (err) => {
  if (!err || typeof err !== 'object') return true;
  try {
    return toHttpError(err).status >= 500;
  } catch {
    return true;
  }
};

// Recursively redact values whose key looks sensitive.
const redact = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
};

// beforeSend / beforeBreadcrumb scrubber. Pure function (unit tested).
const scrubEvent = (event) => {
  if (!event || typeof event !== 'object') return event;
  if (event.request) {
    const req = event.request;
    delete req.data; // request bodies
    delete req.cookies;
    delete req.query_string;
    if (typeof req.url === 'string') req.url = req.url.split('?')[0];
    if (req.headers) {
      const headers = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (/^(authorization|cookie|set-cookie|x-api-key|x-.*token.*|x-webhook-secret)$/i.test(k)) continue;
        headers[k] = v;
      }
      req.headers = headers;
    }
  }
  if (event.user) {
    // Keep only the opaque user id.
    event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  }
  if (event.extra) event.extra = redact(event.extra);
  if (event.contexts) event.contexts = redact(event.contexts);
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => (b && b.data ? { ...b, data: redact(b.data) } : b));
  }
  return event;
};

const beforeSend = (event, hint) => {
  const err = hint && hint.originalException;
  if (err && typeof err === 'object' && !shouldReport(err)) return null;
  return scrubEvent(event);
};

const readVersion = () => {
  try {
    return require('./package.json').version;
  } catch {
    return undefined;
  }
};

const initSentry = () => {
  if (Sentry) return Sentry;
  if (!isConfigured()) return null;
  Sentry = require('@sentry/node');
  const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  Sentry.init({
    dsn: process.env.SENTRY_DSN.trim(),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || readVersion(),
    sendDefaultPii: false,
    includeLocalVariables: false,
    tracesSampleRate: Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : 0,
    integrations: (defaults) => [
      ...defaults.filter((i) => i.name !== 'Express' && i.name !== 'LocalVariables'),
      // Capture only 5xx / unexpected errors (same mapping as our errorHandler).
      Sentry.expressIntegration({ shouldHandleError: shouldReport }),
    ],
    beforeSend,
    beforeBreadcrumb: (crumb) => (crumb && crumb.data ? { ...crumb, data: redact(crumb.data) } : crumb),
  });
  console.log('[sentry] error tracking enabled');
  return Sentry;
};

const getSentry = () => Sentry;

// Express middleware (only mounted when Sentry is enabled): tag events with the
// active pharmacy and the user id as soon as the auth / scope middleware set them.
const sentryRequestContext = (req, res, next) => {
  if (!Sentry) return next();
  const scope = Sentry.getIsolationScope();
  const track = (prop, apply) => {
    let current = req[prop];
    Object.defineProperty(req, prop, {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (v) => {
        current = v;
        try {
          apply(v);
        } catch {
          // never break a request because of monitoring
        }
      },
    });
  };
  track('pharmacyId', (v) => v && scope.setTag('pharmacyId', String(v)));
  track('user', (u) => u && u._id && scope.setUser({ id: String(u._id) }));
  return next();
};

initSentry();

module.exports = {
  initSentry,
  getSentry,
  isConfigured,
  shouldReport,
  scrubEvent,
  beforeSend,
  sentryRequestContext,
};
