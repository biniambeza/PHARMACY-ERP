// Process entrypoint: validate env, connect to MongoDB, then start listening.
// The Express app itself lives in app.js (importable by tests without side effects).
require('dotenv').config();
// Optional Sentry error tracking (no-op unless SENTRY_DSN is set). Must be loaded
// before express / mongoose so its instrumentation can hook into them.
require('./instrument');

const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key] || !process.env[key].trim());
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(', ')}. See backend/.env.example.`);
  process.exit(1);
}

// Tokens are HS256-signed with JWT_SECRET: a short secret can be brute-forced offline.
const MIN_JWT_SECRET_LENGTH = 32;
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.trim().length < MIN_JWT_SECRET_LENGTH) {
  console.error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters in production.`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  console.warn('Warning: CLIENT_URL is not set; browser requests from any origin will be rejected by CORS.');
}

const mongoose = require('mongoose');
const connectDB = require('./config/db');
const app = require('./app');
const { getSentry } = require('./instrument');

const PORT = process.env.PORT || 5000;
const SHUTDOWN_TIMEOUT_MS = 25000; // Render sends SIGKILL ~30s after SIGTERM
let server = null;
let shuttingDown = false;

const sentryCapture = (err) => {
  const Sentry = getSentry();
  if (!Sentry) return;
  try {
    Sentry.captureException(err);
  } catch {
    // never fail because of monitoring
  }
};

const sentryFlush = async (timeoutMs = 2000) => {
  const Sentry = getSentry();
  if (!Sentry) return;
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // ignore
  }
};

// Graceful shutdown (SIGTERM on every Render deploy / restart, SIGINT on Ctrl+C):
// stop accepting connections, let in-flight requests finish, stop the cron jobs,
// close MongoDB, flush Sentry, exit 0. Hard exit after SHUTDOWN_TIMEOUT_MS.
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: shutting down gracefully`);
  const hardExit = setTimeout(() => {
    console.error(`Shutdown did not finish within ${SHUTDOWN_TIMEOUT_MS / 1000}s, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  hardExit.unref();

  try {
    if (server) {
      const closed = new Promise((resolve) => server.close(() => resolve()));
      // Idle keep-alive sockets would otherwise hold server.close() open.
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      await closed;
    }
    await require('./jobs').stopJobs();
    await mongoose.disconnect();
    await sentryFlush(2000);
    console.log('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error(`Error during shutdown: ${err && err.message}`);
    sentryCapture(err);
    await sentryFlush(2000);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A stray rejected promise is a bug, but not a reason to take the whole API down.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  sentryCapture(reason instanceof Error ? reason : new Error(String(reason)));
});

// After an uncaught exception the process state is unknown: report, flush and exit
// (Render restarts the service).
process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err);
  sentryCapture(err);
  await sentryFlush(2000);
  process.exit(1);
});

// Fail fast (production + existing 2FA users) / warn when TWO_FACTOR_ENCRYPTION_KEY is missing.
const checkTwoFactorKey = async () => {
  const { checkEncryptionKeyConfig } = require('./utils/twoFactor');
  const User = require('./models/User');
  const result = await checkEncryptionKeyConfig({
    countTwoFactorUsers: () => User.countDocuments({ 'twoFactor.enabled': true }),
  });
  if (result.level === 'fatal') {
    console.error(`FATAL: ${result.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
  if (result.level === 'warn') {
    const banner = '!'.repeat(78);
    console.warn(`${banner}\nWARNING: ${result.message}\n${banner}`);
  }
};

const start = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }

  // Indexes: mongoose autoIndex (default on) runs createIndexes for every model at start-up,
  // which only ADDS missing indexes. Indexes that are no longer in the schemas (e.g. the old
  // global invoiceNumber_1 / poNumber_1 / owner_1 unique indexes) and indexes added by hand or
  // by the Atlas Performance Advisor are never dropped on boot: run
  // `npm run db:sync-indexes` (dry run) / `-- --apply` deliberately. See docs/OPERATIONS.md.

  try {
    await checkTwoFactorKey();
  } catch (error) {
    console.warn(`Warning: two-factor key check failed: ${error.message}`);
  }

  // Scheduled jobs (expiry checks, notifications, subscription checks, insurance claims,
  // backups). Controlled by ENABLE_JOBS / BACKUP_CRON; never runs under NODE_ENV=test.
  if (process.env.NODE_ENV !== 'test') {
    try {
      require('./jobs').startJobs();
    } catch (error) {
      console.warn(`Warning: scheduled jobs failed to start: ${error.message}`);
    }
  }

  server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
  // Must exceed the load balancer's idle timeout (Render / AWS ALB: 60s) so the proxy never
  // reuses a socket Node just closed (sporadic 502s). headersTimeout must be larger still.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
};

start();
