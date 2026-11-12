// Builds and exports the Express application.
// No database connection and no listen() here, so tests can `require('./app')`
// and drive it with supertest. See server.js for the process entrypoint.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

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

const isAllowedOrigin = (origin) => {
  if (allowedOrigins.includes(origin)) return true;
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

app.get('/api/health', (req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({
    success: up,
    db: up ? 'up' : 'down',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ---------- API routes (mounted under /api only) ----------
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/reports', reportRoutes);

// ---------- 404 + central error handler (must be last) ----------
app.use(notFound);
app.use(errorHandler);

module.exports = app;
