// Optional error tracking with Sentry (@sentry/react).
//
// Does nothing unless VITE_SENTRY_DSN is set at build time. The SDK is loaded with a
// dynamic import, so builds without a DSN never download it. No session replay, no
// performance tracing unless VITE_SENTRY_TRACES_SAMPLE_RATE > 0, and events are
// scrubbed: no cookies, headers, query strings, request bodies, console output or
// user details other than an opaque id.
const DSN = (import.meta.env.VITE_SENTRY_DSN || '').trim();

let sentry = null;
let loading = null;
const pending = [];

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|otp|pin|api[-_]?key|card|cvv/i;

const stripQuery = (url) => (typeof url === 'string' ? url.split('?')[0].split('#')[0] : url);

const redact = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 5) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
};

export const scrubEvent = (event) => {
  if (!event || typeof event !== 'object') return event;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    event.request.url = stripQuery(event.request.url);
  }
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  if (event.extra) event.extra = redact(event.extra);
  if (event.contexts) event.contexts = redact(event.contexts);
  return event;
};

const scrubBreadcrumb = (crumb) => {
  if (!crumb) return crumb;
  if (crumb.category === 'console') return null; // console output may contain anything
  if (!crumb.data) return crumb;
  const data = redact(crumb.data);
  if (data.url) data.url = stripQuery(data.url);
  if (data.from) data.from = stripQuery(data.from);
  if (data.to) data.to = stripQuery(data.to);
  return { ...crumb, data };
};

export const isMonitoringEnabled = () => Boolean(DSN);

export function initMonitoring() {
  if (!DSN || loading) return loading;
  loading = import('@sentry/react')
    .then((Sentry) => {
      const rate = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE);
      const tracing = Number.isFinite(rate) && rate > 0 && rate <= 1;
      Sentry.init({
        dsn: DSN,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
        release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
        sendDefaultPii: false,
        integrations: tracing ? [Sentry.browserTracingIntegration()] : [],
        tracesSampleRate: tracing ? rate : 0,
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      });
      sentry = Sentry;
      while (pending.length) {
        const [error, info] = pending.shift();
        reportError(error, info);
      }
      return Sentry;
    })
    .catch(() => null); // monitoring must never break the app
  return loading;
}

/** Report an error caught by an error boundary (or anywhere else). No-op without a DSN. */
export function reportError(error, info) {
  if (!DSN) return;
  if (!sentry) {
    if (pending.length < 20) pending.push([error, info]);
    return;
  }
  sentry.withScope((scope) => {
    if (info && info.componentStack) scope.setContext('react', { componentStack: info.componentStack });
    scope.setTag('source', 'error-boundary');
    sentry.captureException(error);
  });
}
