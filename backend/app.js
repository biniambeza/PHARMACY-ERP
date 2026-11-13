// Builds and exports the Express application.
// No database connection and no listen() here, so tests can `require('./app')`
// and drive it with supertest. See server.js for the process entrypoint.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const mongoose = require('mongoose');

const { getSentry, sentryRequestContext } = require('./instrument');
const { version: APP_VERSION } = require('./package.json');

const { errorHandler, notFound } = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const stockRoutes = require('./routes/stockRoutes');
const salesRoutes = require('./routes/salesRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const procurementRoutes = require('./routes/procurementRoutes');
const reportRoutes = require('./routes/reportRoutes');
const platformAdminRoutes = require('./routes/platformAdminRoutes');
const staffRoutes = require('./routes/staffRoutes');
const branchRoutes = require('./routes/branchRoutes');
const returnRoutes = require('./routes/returnRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const customerRoutes = require('./routes/customerRoutes');
const payableRoutes = require('./routes/payableRoutes');
const reorderRoutes = require('./routes/reorderRoutes');
const stockTakeRoutes = require('./routes/stockTakeRoutes');
const movementRoutes = require('./routes/movementRoutes');
const importRoutes = require('./routes/importRoutes');
const patientRoutes = require('./routes/patientRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const controlledRoutes = require('./routes/controlledRoutes');
const interactionRoutes = require('./routes/interactionRoutes');
const auditRoutes = require('./routes/auditRoutes');
const exportRoutes = require('./routes/exportRoutes');
const transferRoutes = require('./routes/transferRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const paymentWebhookRoutes = require('./routes/paymentWebhookRoutes');
const insuranceRoutes = require('./routes/insuranceRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const einvoiceRoutes = require('./routes/einvoiceRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');

const app = express();

// Minimal request logger: method, url, status, duration. Silent in tests.
const requestLogger = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  return next();
};

// Behind a reverse proxy (Render, Railway, Nginx...) the client IP is in
// X-Forwarded-For. Needed for per-IP rate limiting. TRUST_PROXY accepts a hop
// count ("1") or any value Express understands; defaults to 1 hop in production.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '');
if (trustProxy !== '') {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(requestLogger);
// Sentry request context (pharmacyId tag, user id). No-op unless SENTRY_DSN is set.
if (getSentry()) app.use(sentryRequestContext);

// ---------- CORS ----------
// Only the origins listed in CLIENT_URL (comma-separated) are allowed, plus the
// local Vite/CRA dev servers outside production. Requests without an Origin
// header (curl, server-to-server, health checks) are allowed.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

const buildAllowedOrigins = () => {
  const fromEnv = (process.env.CLIENT_URL || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return process.env.NODE_ENV === 'production' ? fromEnv : [...fromEnv, ...DEV_ORIGINS];
};

const allowedOrigins = buildAllowedOrigins();

// Optional, off by default: allow Vercel preview deployments of ONE project,
// e.g. CORS_ALLOW_VERCEL_PREVIEWS_PREFIX=pharmacy-erp-git- allows
// https://pharmacy-erp-git-<anything>.vercel.app but nothing else on vercel.app.
const vercelPreviewPrefix = (process.env.CORS_ALLOW_VERCEL_PREVIEWS_PREFIX || '').trim();

// Outside production, any local dev server port is allowed (Vite moves to
// 5174, 5175... when 5173 is already taken).
const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const isAllowedOrigin = (origin) => {
  if (allowedOrigins.includes(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && LOCAL_DEV_ORIGIN.test(origin)) return true;
  if (vercelPreviewPrefix) {
    try {
      const { protocol, hostname } = new URL(origin);
      return (
        protocol === 'https:' &&
        hostname.endsWith('.vercel.app') &&
        hostname.startsWith(vercelPreviewPrefix) &&
        // exactly one label before .vercel.app
        hostname.split('.').length === 3
      );
    } catch {
      return false;
    }
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      const err = new Error('Not allowed by CORS');
      err.status = 403;
      err.code = 'CORS_REJECTED';
      return callback(err);
    },
    credentials: true,
  })
);

// ---------- Security & parsing ----------
app.use(helmet());
// gzip/deflate JSON and text responses. The streaming exports (/api/export: CSV with
// backpressure, XLSX which is already zipped) are left alone: compression only proxies
// res.on('drain'), not res.off, so the export's drain handling would leak listeners.
app.use(
  compression({
    filter: (req, res) => !req.originalUrl.startsWith('/api/export') && compression.filter(req, res),
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ---------- Utility routes ----------
app.get('/api/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Pharmacy ERP Backend API is running successfully!',
    timestamp: new Date().toISOString(),
  });
});

// Liveness: cheap, unauthenticated, never touches the DB and always 200 while the process
// is up (Render's health check points here: a MongoDB blip must not get the instance
// restarted). The current mongoose connection state is reported as a field only.
// Readiness (DB ping) is /api/health/ready.
const buildInfo = () => ({
  version: APP_VERSION,
  commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
});

const DB_STATES = { 0: 'down', 1: 'up', 2: 'connecting', 3: 'disconnecting' };

app.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    success: true,
    status: 'ok',
    db: DB_STATES[mongoose.connection.readyState] || 'unknown',
    ...buildInfo(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Readiness: also pings MongoDB (admin ping) with a short timeout.
const READY_TIMEOUT_MS = Number(process.env.HEALTH_READY_TIMEOUT_MS) || 2000;

const pingDb = async (timeoutMs = READY_TIMEOUT_MS) => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) throw new Error('not connected');
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    await Promise.race([mongoose.connection.db.admin().command({ ping: 1 }), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

app.get('/api/health/ready', async (req, res) => {
  const started = Date.now();
  let ok = true;
  let reason;
  try {
    await pingDb();
  } catch (err) {
    ok = false;
    reason = err && err.message === 'timeout' ? 'timeout' : 'unreachable';
  }
  res.set('Cache-Control', 'no-store');
  res.status(ok ? 200 : 503).json({
    success: ok,
    db: ok ? 'up' : 'down',
    ...(reason ? { reason } : {}),
    dbLatencyMs: Date.now() - started,
    ...buildInfo(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ---------- API routes (mounted under /api only) ----------
app.use('/api/auth', authRoutes);
app.use('/api/admin/platform', platformAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payables', payableRoutes);
app.use('/api/reorder', reorderRoutes);
app.use('/api/stock-takes', stockTakeRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/import', importRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/controlled', controlledRoutes);
app.use('/api/interactions', interactionRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/einvoice', einvoiceRoutes);
app.use('/api/onboarding', onboardingRoutes);
// Public provider webhook (shared-secret header, no JWT) must be mounted before the protected router
app.use('/api/payments/webhook', paymentWebhookRoutes);
app.use('/api/payments', paymentRoutes);

// ---------- 404 + central error handler (must be last) ----------
app.use(notFound);
// Sentry error capture (only 5xx / unexpected errors are sent; see instrument.js).
const sentry = getSentry();
if (sentry) sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

module.exports = app;
