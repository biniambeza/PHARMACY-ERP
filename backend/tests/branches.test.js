const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const Transfer = require('../models/Transfer');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const { checkSubscriptions } = require('../controllers/platformAdminController');

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
};

const as = (token, pharmacyId) => ({ ...auth(token), ...(pharmacyId ? { 'x-pharmacy-id': String(pharmacyId) } : {}) });

let O; // owner of branch A (+ B)
let A; // pharmacy A (source)
let B; // branch B (destination)
let other; // unrelated pharmacy (another organization)
let adminToken;

beforeAll(async () => {
  await connectTestDb('branches');
  O = await createPharmacist();
  A = O.pharmacy;
  const res = await request(app).post('/api/branches').set(as(O.token, A._id)).send({
    name: `Branch B ${uid()}`, address: '2 Test St', phone: '0911', licenseNo: `LB-${uid()}`,
  });
  if (res.status !== 201) throw new Error(`branch create failed ${res.status} ${JSON.stringify(res.body)}`);
  B = res.body.branch;
  other = await createPharmacist();

  const adminEmail = `admin_${uid()}@example.com`;
  await User.create({ name: 'Admin', email: adminEmail, password: PASSWORD, role: 'admin' });
  adminToken = await login(adminEmail);
});

afterAll(disconnectTestDb);

const qty = async (batchId) => (await StockBatch.findById(batchId)).quantity;

describe('Branch transfers', () => {
  test('send and receive move stock with movements on both sides; double receive rejected', async () => {
    const med = await createMedicine(A._id, { name: `Amoxicillin ${uid()}` });
    const batch = await insertBatchRaw(A._id, med._id, { batchNo: 'AMX-1', quantity: 50, expiryDate: daysFromNow(200) });

    const send = await request(app).post('/api/transfers').set(as(O.token, A._id)).send({
      toPharmacyId: B._id,
      lines: [{ medicineId: med._id, batchId: batch._id, quantity: 20 }],
      notes: 'restock',
    });
    expect(send.status).toBe(201);
    expect(send.body.transfer.status).toBe('in_transit');
    expect(send.body.transfer.number).toMatch(/^TRF-/);
    expect(await qty(batch._id)).toBe(30);
    const out = await StockMovement.find({ refId: send.body.transfer._id, type: 'transfer_out' });
    expect(out).toHaveLength(1);
    expect(out[0].quantityChange).toBe(-20);
    expect(String(out[0].pharmacyId)).toBe(String(A._id));

    // The destination sees it as incoming
    const incoming = await request(app).get('/api/transfers?direction=incoming').set(as(O.token, B._id));
    expect(incoming.status).toBe(200);
    expect(incoming.body.transfers.map((t) => t._id)).toContain(send.body.transfer._id);

    // The source cannot receive its own outgoing transfer
    const wrong = await request(app).post(`/api/transfers/${send.body.transfer._id}/receive`).set(as(O.token, A._id));
    expect(wrong.status).toBe(404);

    const recv = await request(app).post(`/api/transfers/${send.body.transfer._id}/receive`).set(as(O.token, B._id));
    expect(recv.status).toBe(200);
    expect(recv.body.transfer.status).toBe('received');

    // Medicine copied into B's catalog with the same batch number / expiry
    const destMed = await Medicine.findOne({ pharmacyId: B._id, name: med.name });
    expect(destMed).toBeTruthy();
    const destBatch = await StockBatch.findOne({ pharmacyId: B._id, medicineId: destMed._id, batchNo: 'AMX-1' });
    expect(destBatch.quantity).toBe(20);
    expect(destBatch.expiryDate.toISOString().slice(0, 10)).toBe(batch.expiryDate.toISOString().slice(0, 10));
    const inMov = await StockMovement.find({ refId: send.body.transfer._id, type: 'transfer_in' });
    expect(inMov).toHaveLength(1);
    expect(String(inMov[0].pharmacyId)).toBe(String(B._id));
    expect(inMov[0].quantityChange).toBe(20);

    const again = await request(app).post(`/api/transfers/${send.body.transfer._id}/receive`).set(as(O.token, B._id));
    expect(again.status).toBe(409);
    expect((await StockBatch.findById(destBatch._id)).quantity).toBe(20);
  });

  test('second transfer merges into the existing destination batch and matches medicine by name (case-insensitive)', async () => {
    const name = `Ibuprofen ${uid()}`;
    const med = await createMedicine(A._id, { name });
    await createMedicine(B._id, { name: name.toUpperCase() });
    const batch = await insertBatchRaw(A._id, med._id, { batchNo: 'IBU-1', quantity: 40, expiryDate: daysFromNow(300) });

    for (const q of [5, 7]) {
      const s = await request(app).post('/api/transfers').set(as(O.token, A._id))
        .send({ toPharmacyId: B._id, lines: [{ medicineId: med._id, batchId: batch._id, quantity: q }] });
      expect(s.status).toBe(201);
      const r = await request(app).post(`/api/transfers/${s.body.transfer._id}/receive`).set(as(O.token, B._id));
      expect(r.status).toBe(200);
    }
    const destMeds = await Medicine.find({ pharmacyId: B._id, name: new RegExp(`^${name}$`, 'i') });
    expect(destMeds).toHaveLength(1);
    const destBatches = await StockBatch.find({ pharmacyId: B._id, medicineId: destMeds[0]._id });
    expect(destBatches).toHaveLength(1);
    expect(destBatches[0].quantity).toBe(12);
  });

  test('concurrent receives: exactly one wins', async () => {
    const med = await createMedicine(A._id);
    const batch = await insertBatchRaw(A._id, med._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const s = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: med._id, batchId: batch._id, quantity: 6 }] });
    expect(s.status).toBe(201);
    const url = `/api/transfers/${s.body.transfer._id}/receive`;
    const results = await Promise.all([
      request(app).post(url).set(as(O.token, B._id)),
      request(app).post(url).set(as(O.token, B._id)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const destMed = await Medicine.findOne({ pharmacyId: B._id, name: med.name });
    const total = (await StockBatch.find({ pharmacyId: B._id, medicineId: destMed._id })).reduce((n, b) => n + b.quantity, 0);
    expect(total).toBe(6);
  });

  test('FEFO allocation skips expired batches and rejects insufficient stock', async () => {
    const med = await createMedicine(A._id);
    await insertBatchRaw(A._id, med._id, { batchNo: 'OLD', quantity: 100, expiryDate: daysFromNow(-5) });
    const soon = await insertBatchRaw(A._id, med._id, { batchNo: 'SOON', quantity: 4, expiryDate: daysFromNow(30) });
    const later = await insertBatchRaw(A._id, med._id, { batchNo: 'LATER', quantity: 10, expiryDate: daysFromNow(90) });

    const tooMuch = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: med._id, quantity: 20 }] });
    expect(tooMuch.status).toBe(409);
    expect(await qty(soon._id)).toBe(4);

    const ok = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: med._id, quantity: 6 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.transfer.lines.map((l) => [l.batchNo, l.quantity])).toEqual([['SOON', 4], ['LATER', 2]]);
    expect(await qty(soon._id)).toBe(0);
    expect((await StockBatch.findById(soon._id)).status).toBe('depleted');
    expect(await qty(later._id)).toBe(8);
  });

  test('cancel returns in-transit stock to the source', async () => {
    const med = await createMedicine(A._id);
    const batch = await insertBatchRaw(A._id, med._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const s = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: med._id, batchId: batch._id, quantity: 10 }] });
    expect(s.status).toBe(201);
    expect(await qty(batch._id)).toBe(0);

    const c = await request(app).post(`/api/transfers/${s.body.transfer._id}/cancel`).set(as(O.token, A._id))
      .send({ reason: 'wrong branch' });
    expect(c.status).toBe(200);
    expect(c.body.transfer.status).toBe('cancelled');
    const b = await StockBatch.findById(batch._id);
    expect(b.quantity).toBe(10);
    expect(b.status).toBe('active');
    const back = await StockMovement.find({ refId: s.body.transfer._id, type: 'transfer_in', pharmacyId: A._id });
    expect(back).toHaveLength(1);

    const recv = await request(app).post(`/api/transfers/${s.body.transfer._id}/receive`).set(as(O.token, B._id));
    expect(recv.status).toBe(409);
    const again = await request(app).post(`/api/transfers/${s.body.transfer._id}/cancel`).set(as(O.token, A._id));
    expect(again.status).toBe(409);
  });

  test('draft transfers deduct nothing until sent', async () => {
    const med = await createMedicine(A._id);
    const batch = await insertBatchRaw(A._id, med._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const d = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, draft: true, lines: [{ medicineId: med._id, quantity: 3 }] });
    expect(d.status).toBe(201);
    expect(d.body.transfer.status).toBe('draft');
    expect(await qty(batch._id)).toBe(10);
    // Drafts are invisible to the destination
    const inc = await request(app).get('/api/transfers?direction=incoming').set(as(O.token, B._id));
    expect(inc.body.transfers.map((t) => t._id)).not.toContain(d.body.transfer._id);

    const s = await request(app).post(`/api/transfers/${d.body.transfer._id}/send`).set(as(O.token, A._id));
    expect(s.status).toBe(200);
    expect(s.body.transfer.status).toBe('in_transit');
    expect(await qty(batch._id)).toBe(7);
  });

  test('cross-organization transfer is rejected', async () => {
    const med = await createMedicine(A._id);
    const batch = await insertBatchRaw(A._id, med._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const res = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: other.pharmacy._id, lines: [{ medicineId: med._id, quantity: 1 }] });
    expect(res.status).toBe(403);
    expect(await qty(batch._id)).toBe(10);
    expect(await Transfer.countDocuments({ toPharmacyId: other.pharmacy._id })).toBe(0);
  });

  test('membership and permission are enforced (no receive without destination membership; cashier blocked)', async () => {
    const med = await createMedicine(A._id);
    const batch = await insertBatchRaw(A._id, med._id, { quantity: 10, expiryDate: daysFromNow(100) });
    const s = await request(app).post('/api/transfers').set(as(O.token, A._id))
      .send({ toPharmacyId: B._id, lines: [{ medicineId: med._id, batchId: batch._id, quantity: 2 }] });
    expect(s.status).toBe(201);

    const mk = async (role) => {
      const email = `${role}_${uid()}@example.com`;
      const r = await request(app).post('/api/staff').set(as(O.token, A._id))
        .send({ name: role, email, password: PASSWORD, role });
      expect(r.status).toBe(201);
      return login(email);
    };
    const storekeeper = await mk('storekeeper');
    const cashier = await mk('cashier');

    const noAccess = await request(app).post(`/api/transfers/${s.body.transfer._id}/receive`).set(as(storekeeper, B._id));
    expect(noAccess.status).toBe(403);
    const list = await request(app).get('/api/transfers').set(as(storekeeper, A._id));
    expect(list.status).toBe(200);
    const cash = await request(app).get('/api/transfers').set(as(cashier, A._id));
    expect(cash.status).toBe(403);
    const otherOwner = await request(app).get(`/api/transfers/${s.body.transfer._id}`).set(as(other.token));
    expect(otherOwner.status).toBe(404);
  });

  test('destinations and consolidated report', async () => {
    const dest = await request(app).get('/api/transfers/destinations').set(as(O.token, A._id));
    expect(dest.status).toBe(200);
    expect(dest.body.branches.map((b) => String(b._id))).toEqual([String(B._id)]);

    const cons = await request(app).get('/api/transfers/consolidated').set(as(O.token, A._id));
    expect(cons.status).toBe(200);
    expect(cons.body.branches).toHaveLength(2);
    expect(cons.body.total.stockValue).toBeCloseTo(
      cons.body.branches.reduce((s, b) => s + b.stockValue, 0),
      2
    );
    expect(cons.body.total.stockValue).toBeGreaterThan(0);

    // A non-owner staff member cannot see consolidated figures
    const email = `pharm_${uid()}@example.com`;
    await request(app).post('/api/staff').set(as(O.token, A._id))
      .send({ name: 'Ph', email, password: PASSWORD, role: 'pharmacist' });
    const ph = await login(email);
    const denied = await request(app).get('/api/transfers/consolidated').set(as(ph, A._id));
    expect(denied.status).toBe(403);
  });
});

describe('Subscriptions', () => {
  test('checkSubscriptions marks past_due after grace and suspends later', async () => {
    const p = await createPharmacist({ login: false });
    const now = new Date();
    await Pharmacy.updateOne(
      { _id: p.pharmacy._id },
      { $set: { 'subscription.status': 'active', 'subscription.currentPeriodEnd': new Date(now.getTime() - 5 * 864e5) } }
    );
    const r1 = await checkSubscriptions({ now, graceDays: 3, suspendAfterDays: 7 });
    expect(r1.pastDueIds.map(String)).toContain(String(p.pharmacy._id));
    let ph = await Pharmacy.findById(p.pharmacy._id);
    expect(ph.subscription.status).toBe('past_due');
    expect(ph.status).toBe('active');

    const later = new Date(now.getTime() + 6 * 864e5); // 11 days past the period end
    const r2 = await checkSubscriptions({ now: later, graceDays: 3, suspendAfterDays: 7 });
    expect(r2.suspendedIds.map(String)).toContain(String(p.pharmacy._id));
    ph = await Pharmacy.findById(p.pharmacy._id);
    expect(ph.status).toBe('suspended');
    expect(await Notification.countDocuments({ pharmacyId: p.pharmacy._id, type: 'pharmacy_suspended' })).toBe(1);

    // Pharmacies without a period end are never touched
    expect((await Pharmacy.findById(A._id)).status).toBe('active');

    // Admin extends and reactivates
    const ext = await request(app).patch(`/api/admin/platform/pharmacies/${p.pharmacy._id}/subscription`)
      .set(auth(adminToken)).send({ extendDays: 30, reactivate: true });
    expect(ext.status).toBe(200);
    expect(ext.body.pharmacy.status).toBe('active');
    expect(ext.body.pharmacy.subscription.status).toBe('active');
    expect(await Notification.countDocuments({ pharmacyId: p.pharmacy._id, type: 'pharmacy_reactivated' })).toBe(1);

    // Manual suspend / reactivate also notifies
    const t1 = await request(app).patch(`/api/admin/pharmacies/${p.pharmacy._id}/toggle-status`).set(auth(adminToken));
    expect(t1.body.pharmacy.status).toBe('suspended');
    expect(await Notification.countDocuments({ pharmacyId: p.pharmacy._id, type: 'pharmacy_suspended' })).toBe(2);
    await request(app).patch(`/api/admin/pharmacies/${p.pharmacy._id}/toggle-status`).set(auth(adminToken));
    expect(await Notification.countDocuments({ pharmacyId: p.pharmacy._id, type: 'pharmacy_reactivated' })).toBe(2);
    expect(new Date(ext.body.pharmacy.subscription.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now() + 29 * 864e5);
  });

  test('subscription validation', async () => {
    const bad = await request(app).patch(`/api/admin/platform/pharmacies/${A._id}/subscription`)
      .set(auth(adminToken)).send({ status: 'free' });
    expect(bad.status).toBe(400);
  });
});

describe('Announcements', () => {
  test('visible by audience and time window', async () => {
    const all = await request(app).post('/api/admin/platform/announcements').set(auth(adminToken))
      .send({ title: `All ${uid()}`, message: 'Maintenance tonight', severity: 'warning', audience: 'all' });
    expect(all.status).toBe(201);
    const targeted = await request(app).post('/api/admin/platform/announcements').set(auth(adminToken))
      .send({ title: `Only other ${uid()}`, message: 'Hi', audience: [String(other.pharmacy._id)] });
    expect(targeted.status).toBe(201);
    await Announcement.create({ title: 'Expired', message: 'x', startsAt: daysFromNow(-10), endsAt: daysFromNow(-1) });
    await Announcement.create({ title: 'Future', message: 'x', startsAt: daysFromNow(2) });

    const forA = await request(app).get('/api/announcements/active').set(as(O.token, A._id));
    expect(forA.status).toBe(200);
    const titlesA = forA.body.announcements.map((a) => a.title);
    expect(titlesA).toContain(all.body.announcement.title);
    expect(titlesA).not.toContain(targeted.body.announcement.title);
    expect(titlesA).not.toContain('Expired');
    expect(titlesA).not.toContain('Future');

    const forOther = await request(app).get('/api/announcements/active').set(as(other.token));
    const titlesO = forOther.body.announcements.map((a) => a.title);
    expect(titlesO).toEqual(expect.arrayContaining([all.body.announcement.title, targeted.body.announcement.title]));

    const upd = await request(app).put(`/api/admin/platform/announcements/${all.body.announcement._id}`)
      .set(auth(adminToken)).send({ endsAt: daysFromNow(-1), startsAt: daysFromNow(-2) });
    expect(upd.status).toBe(200);
    const after = await request(app).get('/api/announcements/active').set(as(O.token, A._id));
    expect(after.body.announcements.map((a) => a.title)).not.toContain(all.body.announcement.title);

    const del = await request(app).delete(`/api/admin/platform/announcements/${targeted.body.announcement._id}`)
      .set(auth(adminToken));
    expect(del.status).toBe(200);
  });
});

describe('Admin-only enforcement and support mode', () => {
  test('pharmacists cannot use platform admin endpoints', async () => {
    for (const [method, url] of [
      ['get', '/api/admin/platform/metrics'],
      ['get', '/api/admin/platform/subscriptions'],
      ['post', '/api/admin/platform/announcements'],
      ['patch', `/api/admin/platform/pharmacies/${A._id}/subscription`],
      ['get', `/api/admin/platform/pharmacies/${A._id}/support`],
    ]) {
      const res = await request(app)[method](url).set(auth(O.token)).send({});
      expect(res.status).toBe(403);
    }
  });

  test('admin gets metrics and support overview', async () => {
    const m = await request(app).get('/api/admin/platform/metrics?months=6').set(auth(adminToken));
    expect(m.status).toBe(200);
    expect(m.body.metrics.salesByMonth).toHaveLength(6);
    expect(m.body.metrics.pharmacies.active).toBeGreaterThan(0);

    const s = await request(app).get(`/api/admin/platform/pharmacies/${A._id}/support`).set(auth(adminToken));
    expect(s.status).toBe(200);
    expect(s.body.readOnly).toBe(true);
    expect(s.body.summary.medicines).toBeGreaterThan(0);
    expect(s.body.staff.some((u) => u.role === 'owner')).toBe(true);
  });

  test('admin support mode on tenant routes is read-only', async () => {
    const list = await request(app).get('/api/transfers').set(as(adminToken, A._id));
    expect(list.status).toBe(200);
    expect(list.headers['x-support-mode']).toBe('read-only');
    expect(list.body.transfers.length).toBeGreaterThan(0);

    const noPharmacy = await request(app).get('/api/transfers').set(auth(adminToken));
    expect(noPharmacy.status).toBe(400);

    const write = await request(app).post('/api/transfers').set(as(adminToken, A._id))
      .send({ toPharmacyId: B._id, lines: [] });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('SUPPORT_READ_ONLY');
  });
});
