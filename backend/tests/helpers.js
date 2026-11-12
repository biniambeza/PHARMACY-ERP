const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');

const PASSWORD = 'Str0ngPassw0rd!';
let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

// Connect mongoose to the shared in-memory replica set, using a database unique to the test file.
async function connectTestDb(name) {
  const uri = process.env.MONGO_URI_TEST;
  if (!uri) throw new Error('MONGO_URI_TEST not set: globalSetup did not run');
  await mongoose.connect(uri, {
    dbName: `test_${name}_${uid()}`,
    // The MongoDB driver (7.x) loads 'os' with a dynamic import(), which fails inside Jest's
    // CommonJS sandbox and leaves the handshake without client metadata ("Missing required
    // sub-document 'driver'"). Passing the os module explicitly avoids the dynamic import.
    runtimeAdapters: { os: require('os') },
  });
  // Make sure unique indexes exist before tests rely on them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function disconnectTestDb() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
}

// Creates a pharmacist user + pharmacy and returns them with a token obtained via the login API.
async function createPharmacist({ status = 'active', login = true } = {}) {
  const id = uid();
  const email = `pharm_${id}@example.com`;
  const user = await User.create({ name: `Pharmacist ${id}`, email, password: PASSWORD, role: 'pharmacist' });
  const pharmacy = await Pharmacy.create({
    name: `Pharmacy ${id}`,
    address: '1 Test Street',
    phone: '0911000000',
    licenseNo: `LIC-${id}`,
    owner: user._id,
    status,
  });
  let token;
  if (login) {
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login failed for test pharmacist: ${res.status} ${JSON.stringify(res.body)}`);
    }
    token = res.body.token;
  }
  return { user, pharmacy, token, email, password: PASSWORD };
}

async function createMedicine(pharmacyId, overrides = {}) {
  return Medicine.create({
    pharmacyId,
    name: `Med ${uid()}`,
    category: 'Analgesic',
    price: 10,
    costPrice: 5,
    ...overrides,
  });
}

// Inserts a batch directly into the collection, bypassing schema validation/hooks
// (needed for batches with a past expiry date).
async function insertBatchRaw(pharmacyId, medicineId, { batchNo, quantity, expiryDate, status = 'active' }) {
  const now = new Date();
  const doc = {
    pharmacyId,
    medicineId,
    batchNo: batchNo || `B-${uid()}`,
    quantity,
    initialQuantity: quantity,
    expiryDate,
    purchasePrice: 5,
    status,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await StockBatch.collection.insertOne(doc);
  return StockBatch.findById(insertedId);
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
  app,
  request,
  PASSWORD,
  uid,
  daysFromNow,
  connectTestDb,
  disconnectTestDb,
  createPharmacist,
  createMedicine,
  insertBatchRaw,
  auth,
};
