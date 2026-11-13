const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const User = require('../models/User');
const StockBatch = require('../models/StockBatch');
const StockMovement = require('../models/StockMovement');
const PurchaseOrder = require('../models/PurchaseOrder');
const Notification = require('../models/Notification');
const PasswordResetToken = require('../models/PasswordResetToken');
const notify = require('../services/notify');
const {
  runPharmacyChecks, notifyOverduePOs, notifyLowStock, normalizeThresholds,
} = require('../jobs/dailyChecks');

beforeAll(() => connectTestDb('notify'));
afterAll(disconnectTestDb);
afterEach(() => jest.restoreAllMocks());

const waitFor = async (fn, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('waitFor timed out');
};

describe('services/notify.createNotification', () => {
  test('dedupes on pharmacyId + type + dedupeKey within the window', async () => {
    const P = await createPharmacist({ login: false });
    const a = await notify.createNotification({ pharmacyId: P.pharmacy._id, type: 'system', title: 'Hi', dedupeKey: 'k1' });
    const b = await notify.createNotification({ pharmacyId: P.pharmacy._id, type: 'system', title: 'Hi again', dedupeKey: 'k1' });
    const c = await notify.createNotification({ pharmacyId: P.pharmacy._id, type: 'system', title: 'Other', dedupeKey: 'k2' });
    expect(a.wasCreated).toBe(true);
    expect(b.wasCreated).toBe(false);
    expect(String(b._id)).toBe(String(a._id));
    expect(c.wasCreated).toBe(true);
    expect(await Notification.countDocuments({ pharmacyId: P.pharmacy._id })).toBe(2);
  });

  test('never throws on bad input', async () => {
    await expect(notify.createNotification({ type: 'x' })).resolves.toBeNull();
  });

  test('normalizeThresholds sanitizes settings', () => {
    expect(normalizeThresholds([90, 30, 30, -1, 'x'])).toEqual([30, 90]);
    expect(normalizeThresholds([])).toEqual([30, 60, 90]);
  });
});

describe('Daily expiry job (#4)', () => {
  test('marks expired batches, records an expire movement and notifies once', async () => {
    const P = await createPharmacist({ login: false });
    const med = await createMedicine(P.pharmacy._id, { minStockLevel: 0 });
    const past = await insertBatchRaw(P.pharmacy._id, med._id, { quantity: 7, expiryDate: daysFromNow(-2) });
    const soon = await insertBatchRaw(P.pharmacy._id, med._id, { quantity: 4, expiryDate: daysFromNow(10) });
    const later = await insertBatchRaw(P.pharmacy._id, med._id, { quantity: 4, expiryDate: daysFromNow(200) });

    const first = await runPharmacyChecks(P.pharmacy, { summary: false });
    expect(first.expired).toBe(1);
    expect(first.expiringNotified).toBe(1);

    const expiredBatch = await StockBatch.findById(past._id);
    expect(expiredBatch.status).toBe('expired');
    expect(expiredBatch.quantity).toBe(7); // kept for write-off reporting
    expect((await StockBatch.findById(soon._id)).status).toBe('active');
    expect((await StockBatch.findById(later._id)).status).toBe('active');

    const moves = await StockMovement.find({ batchId: past._id, type: 'expire' });
    expect(moves).toHaveLength(1);
    expect(moves[0].quantityChange).toBe(0);
    expect(moves[0].balanceAfter).toBe(7);
    expect(moves[0].reason).toBe('auto-expired');

    const countAfterFirst = await Notification.countDocuments({ pharmacyId: P.pharmacy._id });
    expect(await Notification.countDocuments({ pharmacyId: P.pharmacy._id, type: 'expired' })).toBe(1);
    expect(await Notification.countDocuments({ pharmacyId: P.pharmacy._id, type: 'expiring_soon' })).toBe(1);

    // Second run: nothing new
    const second = await runPharmacyChecks(P.pharmacy, { summary: false });
    expect(second.expired).toBe(0);
    expect(second.expiringNotified).toBe(0);
    expect(await StockMovement.countDocuments({ batchId: past._id, type: 'expire' })).toBe(1);
    expect(await Notification.countDocuments({ pharmacyId: P.pharmacy._id })).toBe(countAfterFirst);
  });

  test('low stock and overdue purchase orders are notified once per day', async () => {
    const P = await createPharmacist({ login: false });
    await createMedicine(P.pharmacy._id, { minStockLevel: 20 }); // no stock at all
    await PurchaseOrder.create({
      pharmacyId: P.pharmacy._id,
      pharmacistId: P.user._id,
      supplierId: new mongoose.Types.ObjectId(),
      poNumber: `PO-${uid()}`,
      items: [],
      totalAmount: 0,
      status: 'ordered',
      expectedDelivery: daysFromNow(-3),
    });

    const low1 = await notifyLowStock(P.pharmacy);
    const po1 = await notifyOverduePOs(P.pharmacy);
    expect(low1.lowStock).toBe(1);
    expect(low1.lowStockNotified).toBe(true);
    expect(po1.overduePOs).toBe(1);
    expect(po1.overdueNotified).toBe(1);

    const low2 = await notifyLowStock(P.pharmacy);
    const po2 = await notifyOverduePOs(P.pharmacy);
    expect(low2.lowStockNotified).toBe(false);
    expect(po2.overdueNotified).toBe(0);
    expect(await Notification.countDocuments({ pharmacyId: P.pharmacy._id, type: 'po_overdue' })).toBe(1);
    expect(await Notification.countDocuments({ pharmacyId: P.pharmacy._id, type: 'low_stock' })).toBe(1);
  });

  test('daily summary emails the owner when enabled', async () => {
    const P = await createPharmacist({ login: false });
    P.pharmacy.settings.notify.dailySummary = true;
    P.pharmacy.settings.notify.email = true;
    await P.pharmacy.save();
    const spy = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    const stats = await runPharmacyChecks(P.pharmacy);
    expect(stats.summarySent).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].to).toBe(P.email);
  });

  test('POST /api/notifications/run-checks runs on demand for owners', async () => {
    const P = await createPharmacist();
    const med = await createMedicine(P.pharmacy._id, { minStockLevel: 0 });
    await insertBatchRaw(P.pharmacy._id, med._id, { quantity: 3, expiryDate: daysFromNow(-1) });
    const res = await request(app).post('/api/notifications/run-checks').set(auth(P.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.stats.expired).toBe(1);

    const overview = await request(app).get('/api/notifications/expiry-overview').set(auth(P.token));
    expect(overview.status).toBe(200);
    expect(overview.body.buckets.expired.count).toBe(1);
    expect(overview.body.buckets.expired.costValue).toBe(15);
    expect(overview.body.writeOffs).toHaveLength(12);
    expect(overview.body.writeOffs.reduce((s, r) => s + r.costValue, 0)).toBe(15);
    expect(overview.body.returnToSupplier).toHaveLength(1);
  });
});

describe('Notifications API (#5)', () => {
  test('notifications are scoped by pharmacy and track read state per user', async () => {
    const A = await createPharmacist();
    const B = await createPharmacist();
    await notify.createNotification({ pharmacyId: A.pharmacy._id, type: 'system', title: 'A1' });
    await notify.createNotification({ pharmacyId: A.pharmacy._id, type: 'system', title: 'A2', severity: 'warning' });
    const bNote = await notify.createNotification({ pharmacyId: B.pharmacy._id, type: 'system', title: 'B1' });
    // Addressed to another user only
    await notify.createNotification({
      pharmacyId: A.pharmacy._id, type: 'system', title: 'private', userIds: [B.user._id],
    });

    const list = await request(app).get('/api/notifications').set(auth(A.token));
    expect(list.status).toBe(200);
    expect(list.body.notifications.map((n) => n.title).sort()).toEqual(['A1', 'A2']);
    expect(list.body.unreadCount).toBe(2);

    const filtered = await request(app).get('/api/notifications?severity=warning').set(auth(A.token));
    expect(filtered.body.notifications.map((n) => n.title)).toEqual(['A2']);

    // Cannot touch another pharmacy's notification
    const cross = await request(app).patch(`/api/notifications/${bNote._id}/read`).set(auth(A.token));
    expect(cross.status).toBe(404);

    const id = list.body.notifications[0]._id;
    const read = await request(app).patch(`/api/notifications/${id}/read`).set(auth(A.token));
    expect(read.status).toBe(200);
    const count = await request(app).get('/api/notifications/unread-count').set(auth(A.token));
    expect(count.body.unreadCount).toBe(1);

    const all = await request(app).post('/api/notifications/read-all').set(auth(A.token));
    expect(all.status).toBe(200);
    const after = await request(app).get('/api/notifications').set(auth(A.token));
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.notifications.every((n) => n.read)).toBe(true);

    // B is unaffected
    const bList = await request(app).get('/api/notifications').set(auth(B.token));
    expect(bList.body.unreadCount).toBe(1);
  });

  test('notifications gated by a permission are hidden from roles without it', async () => {
    const A = await createPharmacist();
    await notify.createNotification({ pharmacyId: A.pharmacy._id, type: 'po_overdue', title: 'PO late', perm: 'po:view' });
    // Add a cashier to the pharmacy
    const email = `cashier_${uid()}@example.com`;
    await User.create({
      name: 'Cashier', email, password: A.password, role: 'pharmacist',
      memberships: [{ pharmacyId: A.pharmacy._id, role: 'cashier', active: true }],
    });
    const login = await request(app).post('/api/auth/login').send({ email, password: A.password });
    const cashierList = await request(app).get('/api/notifications').set(auth(login.body.token));
    expect(cashierList.status).toBe(200);
    expect(cashierList.body.notifications).toHaveLength(0);

    const ownerList = await request(app).get('/api/notifications').set(auth(A.token));
    expect(ownerList.body.notifications).toHaveLength(1);

    const runChecks = await request(app).post('/api/notifications/run-checks').set(auth(login.body.token));
    expect(runChecks.status).toBe(403);
  });
});

describe('Password reset (#8)', () => {
  const requestReset = async (email) => {
    const spy = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    const res = await request(app).post('/api/auth/forgot-password').send({ email });
    return { res, spy };
  };

  test('unknown email gets the same generic answer and no email', async () => {
    const { res, spy } = await requestReset(`nobody_${uid()}@example.com`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);
    await new Promise((r) => setTimeout(r, 100));
    expect(spy).not.toHaveBeenCalled();
  });

  test('forgot -> reset flow changes the password and revokes old sessions and tokens', async () => {
    const P = await createPharmacist();
    const { res, spy } = await requestReset(P.email.toUpperCase());
    expect(res.status).toBe(200);
    await waitFor(() => spy.mock.calls.length > 0);
    const { to, text } = spy.mock.calls[0][0];
    expect(to).toBe(P.email);
    const token = /reset-password\?token=([a-f0-9]+)/.exec(text)[1];
    expect(token).toHaveLength(64);

    // Only the hash is stored
    const stored = await PasswordResetToken.findOne({ userId: P.user._id });
    expect(stored.tokenHash).not.toBe(token);

    const short = await request(app).post('/api/auth/reset-password').send({ token, password: 'short' });
    expect(short.status).toBe(400);

    const newPassword = 'BrandNewPass123';
    const ok = await request(app).post('/api/auth/reset-password').send({ token, password: newPassword });
    expect(ok.status).toBe(200);

    // Token is single-use
    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'AnotherPass123' });
    expect(again.status).toBe(400);

    // Old JWT revoked
    const me = await request(app).get('/api/auth/me').set(auth(P.token));
    expect(me.status).toBe(401);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: P.email, password: P.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').send({ email: P.email, password: newPassword });
    expect(newLogin.status).toBe(200);
  });

  test('a newer request invalidates the previous token; expired tokens are rejected', async () => {
    const P = await createPharmacist({ login: false });
    const first = await requestReset(P.email);
    await waitFor(() => first.spy.mock.calls.length > 0);
    const oldToken = /token=([a-f0-9]+)/.exec(first.spy.mock.calls[0][0].text)[1];
    jest.restoreAllMocks();

    const second = await requestReset(P.email);
    await waitFor(() => second.spy.mock.calls.length > 0);

    const useOld = await request(app).post('/api/auth/reset-password').send({ token: oldToken, password: 'BrandNewPass123' });
    expect(useOld.status).toBe(400);

    const newToken = /token=([a-f0-9]+)/.exec(second.spy.mock.calls[0][0].text)[1];
    await PasswordResetToken.updateMany({ userId: P.user._id }, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await request(app).post('/api/auth/reset-password').send({ token: newToken, password: 'BrandNewPass123' });
    expect(expired.status).toBe(400);
  });

  test('admin can force-reset a pharmacist password; others cannot', async () => {
    const P = await createPharmacist();
    const adminEmail = `admin_${uid()}@example.com`;
    await User.create({ name: 'Admin', email: adminEmail, password: P.password, role: 'admin' });
    const adminLogin = await request(app).post('/api/auth/login').send({ email: adminEmail, password: P.password });
    const adminToken = adminLogin.body.token;

    const forbidden = await request(app).post(`/api/auth/admin-reset/${P.user._id}`).set(auth(P.token));
    expect(forbidden.status).toBe(403);

    const res = await request(app).post(`/api/auth/admin-reset/${P.user._id}`).set(auth(adminToken)).send({ mode: 'temp' });
    expect(res.status).toBe(200);
    expect(typeof res.body.tempPassword).toBe('string');
    expect(res.body.tempPassword.length).toBeGreaterThanOrEqual(8);

    const me = await request(app).get('/api/auth/me').set(auth(P.token));
    expect(me.status).toBe(401);
    const login = await request(app).post('/api/auth/login').send({ email: P.email, password: res.body.tempPassword });
    expect(login.status).toBe(200);

    const spy = jest.spyOn(notify, 'sendEmail').mockResolvedValue({ sent: true });
    const emailMode = await request(app).post(`/api/auth/admin-reset/${P.user._id}`).set(auth(adminToken)).send({ mode: 'email' });
    expect(emailMode.status).toBe(200);
    expect(emailMode.body.emailSent).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
