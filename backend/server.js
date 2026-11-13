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

if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  console.warn('Warning: CLIENT_URL is not set; browser requests from any origin will be rejected by CORS.');
}

const connectDB = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }

  // invoiceNumber / poNumber are unique per pharmacy (compound indexes). Older
  // deployments still carry global unique indexes (invoiceNumber_1, poNumber_1)
  // that would cause cross-pharmacy 409s; syncIndexes drops them and builds the
  // new ones. Pharmacy.owner is no longer unique (an owner can run several
  // branches), so the old owner_1 unique index is replaced as well.
  // Non-fatal: log and keep starting.
  if (process.env.NODE_ENV !== 'test') {
    try {
      const Sale = require('./models/Sale');
      const PurchaseOrder = require('./models/PurchaseOrder');
      const Pharmacy = require('./models/Pharmacy');
      const Medicine = require('./models/Medicine');
      await Promise.all([
        Sale.syncIndexes(),
        PurchaseOrder.syncIndexes(),
        Pharmacy.syncIndexes(),
        Medicine.syncIndexes(),
      ]);
    } catch (error) {
      console.warn(`Warning: index sync failed: ${error.message}`);
    }
  }

  // Scheduled jobs (expiry checks, notifications, subscription checks).
  // Controlled by ENABLE_JOBS; never runs under NODE_ENV=test.
  if (process.env.NODE_ENV !== 'test') {
    try {
      require('./jobs').startJobs();
    } catch (error) {
      console.warn(`Warning: scheduled jobs failed to start: ${error.message}`);
    }
  }

  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

start();
