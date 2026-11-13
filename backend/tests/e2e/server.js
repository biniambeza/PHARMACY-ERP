/* eslint-disable no-console */
// End-to-end test backend: the real Express app on an in-memory MongoDB replica set,
// seeded with deterministic data (see fixtures.json). Never touches a real database:
// MONGO_URI is overwritten with the memory server URI before any app module is loaded,
// and app modules never call dotenv themselves (only server.js / scripts do).
//
// Usage: node tests/e2e/server.js   (or: npm run e2e:server)
// Env:   E2E_PORT (default 5055)

// ---- Environment (before requiring any app module) ----
process.env.NODE_ENV = 'test'; // disables rate limits, request logging, jobs and outgoing email/SMS
process.env.JWT_SECRET = 'e2e-jwt-secret-not-for-production';
process.env.ENABLE_JOBS = 'false';
process.env.MONGO_URI = ''; // set to the memory server below; never the value from .env
process.env.SENTRY_DSN = '';
process.env.TWO_FACTOR_ENCRYPTION_KEY = '';
process.env.MOBILE_MONEY_PROVIDER = 'manual';
['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMS_PROVIDER_URL', 'SMS_API_KEY', 'EINVOICE_MOR_BASE_URL', 'EINVOICE_MOR_API_KEY'].forEach(
  (k) => delete process.env[k]
);

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const fixtures = require('./fixtures.json');

const PORT = Number(process.env.E2E_PORT) || fixtures.port;
const BASE = `http://127.0.0.1:${PORT}/api`;
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d) => new Date(Date.now() + d * DAY);

let replSet;
let server;

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`seed: ${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function seed() {
  const User = require('../../models/User');
  const Pharmacy = require('../../models/Pharmacy');
  const Medicine = require('../../models/Medicine');
  const StockBatch = require('../../models/StockBatch');
  const Supplier = require('../../models/Supplier');
  const { password } = fixtures;

  await User.create({ ...fixtures.admin, password, role: 'admin' });

  const owner = await User.create({ ...fixtures.owner, password, role: 'pharmacist' });
  const pharmacy = await Pharmacy.create({
    name: fixtures.pharmacy.name,
    address: '1 Test Street, Addis Ababa',
    phone: '0911000000',
    licenseNo: fixtures.pharmacy.licenseNo,
    owner: owner._id,
    status: 'active',
    onboarding: { dismissedAt: new Date() },
  });
  owner.memberships = [{ pharmacyId: pharmacy._id, role: 'owner', active: true }];
  await owner.save();

  await User.create({
    ...fixtures.cashier,
    password,
    role: 'pharmacist',
    memberships: [{ pharmacyId: pharmacy._id, role: 'cashier', active: true }],
  });

  const meds = {};
  for (const [key, m] of Object.entries(fixtures.medicines)) {
    const med = await Medicine.create({
      pharmacyId: pharmacy._id,
      name: m.name,
      category: 'General',
      price: m.price,
      costPrice: Math.round(m.price * 0.6 * 100) / 100,
      minStockLevel: 5,
    });
    await StockBatch.create({
      pharmacyId: pharmacy._id,
      medicineId: med._id,
      batchNo: `E2E-${key.toUpperCase()}-1`,
      quantity: m.stock,
      initialQuantity: m.stock,
      expiryDate: daysFromNow(m.expiresInDays || 400),
      purchasePrice: med.costPrice,
    });
    meds[key] = med;
  }

  const supplier = await Supplier.create({ pharmacyId: pharmacy._id, ...fixtures.supplier, contactPerson: 'Sam Supplier' });

  // The rest goes through the API (sequences, validation, transactions).
  const { token } = await api('POST', '/auth/login', null, { email: fixtures.owner.email, password });

  // An ordered purchase order (for manual exploration; tests create their own so retries stay independent).
  await api('POST', '/procurement/orders', token, {
    supplierId: supplier._id,
    items: [{ medicineId: meds.purchase._id, quantityOrdered: 30, unitCost: 5 }],
    status: 'ordered',
  });

  const { scheme } = await api('POST', '/insurance/schemes', token, { ...fixtures.insurance.scheme, type: 'employer' });
  await api('POST', '/insurance/members', token, {
    ...fixtures.insurance.member,
    schemeId: scheme._id,
    validFrom: daysFromNow(-30),
    validTo: daysFromNow(365),
  });
}

async function shutdown(signal) {
  console.log(`[e2e] ${signal}: shutting down`);
  const force = setTimeout(() => process.exit(0), 5000);
  force.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  } catch (err) {
    console.error('[e2e] shutdown error:', err.message);
  }
  process.exit(0);
}

async function main() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = replSet.getUri();

  await mongoose.connect(process.env.MONGO_URI, { dbName: 'pharmacy_e2e' });
  const app = require('../../app');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  // Readiness probe for Playwright's webServer: 503 until the seed has finished.
  let ready = false;
  const outer = express();
  outer.get('/__e2e/ready', (req, res) => res.status(ready ? 200 : 503).json({ ready }));
  outer.use(app);

  server = await new Promise((resolve, reject) => {
    const s = outer.listen(PORT, () => resolve(s));
    s.on('error', reject);
  });

  await seed();
  ready = true;
  console.log(`[e2e] backend ready on http://localhost:${PORT} (in-memory MongoDB, seeded)`);
}

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sig) => process.on(sig, () => shutdown(sig)));

main().catch(async (err) => {
  console.error('[e2e] failed to start:', err);
  try {
    if (replSet) await replSet.stop();
  } catch {
    // ignore
  }
  process.exit(1);
});
