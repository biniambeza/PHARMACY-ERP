// Regression tests for the security review fixes:
//  1. tenant isolation of insurance claim payments (body cannot override pharmacyId / id)
//  2. platform admins are read-only on tenant routes
//  3. per-account brute-force protection (password + 2FA)
//  4. server-side logout / session revocation
//  5. JWT algorithm pinning
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Medicine = require('../models/Medicine');
const InsuranceClaim = require('../models/InsuranceClaim');
const AuditLog = require('../models/AuditLog');
const { generateTotp } = require('../utils/twoFactor');
const { requirePermission, requireAnyPermission, allowAdminWrite } = require('../middleware/permission');

let A;
let B;
let admin;

const as = (token, pharmacyId) => ({ ...auth(token), ...(pharmacyId ? { 'x-pharmacy-id': String(pharmacyId) } : {}) });
const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  await connectTestDb('security');
  A = await createPharmacist();
  B = await createPharmacist();
  const email = `admin_${uid()}@example.com`;
  await User.create({ name: 'Platform Admin', email, password: PASSWORD, role: 'admin' });
  admin = { email, token: (await login(email)).body.token };
});
afterAll(disconnectTestDb);

// ---------------------------------------------------------------- 1. insurance

describe('Insurance claim payment tenant isolation', () => {
  const api = (token) => ({
    post: (url, body) => request(app).post(url).set(auth(token)).send(body),
  });

  test('pharmacy B cannot pay / read A\'s claim by injecting pharmacyId and id in the body', async () => {
    const scheme = (await api(A.token).post('/api/insurance/schemes', {
      name: `Scheme ${uid()}`, type: 'cbhi', coveragePercent: 100, copayType: 'none', copayValue: 0,
    })).body.scheme;
    const member = (await api(A.token).post('/api/insurance/members', {
      schemeId: scheme._id, memberNo: `M-${uid()}`, name: `Member ${uid()}`,
      validFrom: daysFromNow(-30), validTo: daysFromNow(300),
    })).body.member;
    const med = await createMedicine(A.pharmacy._id, { price: 10 });
    await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 50, expiryDate: daysFromNow(200) });
    const sale = await api(A.token).post('/api/sales', {
      items: [{ medicineId: med._id, quantity: 5 }],
      payments: [{ method: 'insurance', amount: 99999, schemeId: scheme._id, memberId: member._id }],
    });
    expect(sale.status).toBe(201);
    const built = await api(A.token).post('/api/insurance/claims', {
      schemeId: scheme._id, from: daysFromNow(-1).toISOString(), to: daysFromNow(1).toISOString(),
    });
    expect(built.status).toBe(201);
    const claimId = built.body.claim._id;
    expect((await api(A.token).post(`/api/insurance/claims/${claimId}/submit`)).status).toBe(200);
    const before = await InsuranceClaim.findById(claimId).lean();

    // Attack: B's own (or a random) claim id in the URL, A's claim id + operator in the body
    const attack = await api(B.token).post(`/api/insurance/claims/${new mongoose.Types.ObjectId()}/payments`, {
      pharmacyId: { $ne: null },
      id: claimId,
      amount: 10,
      reference: 'PWN',
    });
    expect([400, 404]).toContain(attack.status);
    expect(JSON.stringify(attack.body)).not.toContain(before.claimNumber);

    // A's claim in the URL directly is not reachable either
    const direct = await api(B.token).post(`/api/insurance/claims/${claimId}/payments`, {
      pharmacyId: { $ne: null }, amount: 10,
    });
    expect([400, 404]).toContain(direct.status);

    const after = await InsuranceClaim.findById(claimId).lean();
    expect(after.paidAmount).toBe(before.paidAmount);
    expect(after.status).toBe(before.status);
    expect(after.payments || []).toHaveLength((before.payments || []).length);
  });
});

// ----------------------------------------------------- 1b. explicit id casting

describe('Body ids are cast explicitly', () => {
  test('operator objects as purchaseOrderId / patientId are rejected with 400', async () => {
    const supplier = await request(app).post('/api/suppliers').set(auth(A.token))
      .send({ name: `Supplier ${uid()}`, phone: '0911223344' });
    expect(supplier.status).toBe(201);
    const supplierId = (supplier.body.supplier || supplier.body.data || supplier.body)._id;

    const inv = await request(app).post('/api/payables/invoices').set(auth(A.token)).send({
      supplierId, invoiceNo: `INV-${uid()}`, amount: 100, purchaseOrderId: { $ne: null },
    });
    expect(inv.status).toBe(400);

    const rx = await request(app).post('/api/prescriptions').set(auth(A.token))
      .send({ patientId: { $ne: null }, items: [] });
    expect(rx.status).toBe(400);
  });
});

// ------------------------------------------------------------ 2. admin read-only

describe('Platform admins are read-only on tenant routes', () => {
  test('admin POST /api/customers is refused (403) and nothing is written', async () => {
    const res = await request(app).post('/api/customers').set(as(admin.token, A.pharmacy._id))
      .send({ name: 'Injected', phone: '0911111111' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUPPORT_READ_ONLY');
    expect(await Customer.countDocuments({ name: 'Injected' })).toBe(0);

    // Without a pharmacy header too
    const noHeader = await request(app).post('/api/customers').set(auth(admin.token))
      .send({ name: 'Injected2', phone: '0911111112' });
    expect(noHeader.status).toBe(403);
    expect(await Customer.countDocuments({ name: 'Injected2' })).toBe(0);
  });

  test('admin POST /api/import/medicines (dryRun false) is refused (403)', async () => {
    const res = await request(app).post('/api/import/medicines').set(as(admin.token, A.pharmacy._id))
      .send({ dryRun: false, rows: [{ name: 'AdminMed', category: 'General', price: 5 }] });
    expect(res.status).toBe(403);
    expect(await Medicine.countDocuments({ name: 'AdminMed' })).toBe(0);
  });

  test('other tenant writes are refused for admins', async () => {
    const h = as(admin.token, A.pharmacy._id);
    expect((await request(app).post('/api/payables/invoices').set(h).send({})).status).toBe(403);
    expect((await request(app).post('/api/stock-takes').set(h).send({})).status).toBe(403);
    expect((await request(app).post('/api/notifications/read-all').set(h)).status).toBe(403);
    expect((await request(app).post('/api/notifications/run-checks').set(h)).status).toBe(403);
    expect((await request(app).post('/api/medicines').set(h).send({ name: 'X' })).status).toBe(403);
    expect((await request(app).post('/api/transfers').set(h).send({})).status).toBe(403);
  });

  test('admin reads keep working in support mode', async () => {
    await request(app).post('/api/customers').set(auth(A.token)).send({ name: `Cust ${uid()}`, phone: '0911000001' });
    const h = as(admin.token, A.pharmacy._id);
    const customers = await request(app).get('/api/customers').set(h);
    expect(customers.status).toBe(200);
    expect(customers.headers['x-support-mode']).toBe('read-only');
    expect((await request(app).get('/api/audit').set(h)).status).toBe(200);
    expect((await request(app).get('/api/payables/invoices').set(h)).status).toBe(200);
    expect((await request(app).get('/api/stock-takes').set(h)).status).toBe(200);
    expect((await request(app).get('/api/movements').set(h)).status).toBe(200);
    expect((await request(app).get('/api/notifications/unread-count').set(h)).status).toBe(200);
  });

  test('platform admin routes still work', async () => {
    expect((await request(app).get('/api/admin/stats').set(auth(admin.token))).status).toBe(200);
    const reset = await request(app).post(`/api/auth/admin-reset-2fa/${B.user._id}`).set(auth(admin.token));
    expect(reset.status).toBe(200);
    B.token = (await login(B.email)).body.token; // the reset revoked B's sessions
  });

  test('tenant users are unaffected', async () => {
    const res = await request(app).post('/api/customers').set(auth(A.token))
      .send({ name: `Cust ${uid()}`, phone: '0911000002' });
    expect(res.status).toBe(201);
  });

  test('requirePermission: admin writes need an explicit opt-in', () => {
    const run = (mw, req) => {
      const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
      const next = jest.fn();
      mw(req, res, next);
      return { res, next };
    };
    const adminUser = { role: 'admin' };
    for (const mw of [requirePermission('customer:manage'), requireAnyPermission('customer:manage')]) {
      expect(run(mw, { user: adminUser, method: 'GET' }).next).toHaveBeenCalled();
      expect(run(mw, { user: adminUser, method: 'HEAD' }).next).toHaveBeenCalled();
      const denied = run(mw, { user: adminUser, method: 'POST' });
      expect(denied.next).not.toHaveBeenCalled();
      expect(denied.res.statusCode).toBe(403);
      expect(denied.res.body.code).toBe('SUPPORT_READ_ONLY');
      for (const m of ['PUT', 'PATCH', 'DELETE']) {
        expect(run(mw, { user: adminUser, method: m }).res.statusCode).toBe(403);
      }
      const req = { user: adminUser, method: 'POST' };
      allowAdminWrite(req, {}, () => {});
      expect(run(mw, req).next).toHaveBeenCalled();
    }
  });
});

// --------------------------------------------------- 3. per-account lockout

describe('Per-account brute-force protection', () => {
  const newUser = async () => {
    const P = await createPharmacist({ login: false });
    return P;
  };

  test('5 wrong passwords lock the account for 15 minutes; generic 401 while locked', async () => {
    const P = await newUser();
    for (let i = 0; i < 5; i += 1) {
      const r = await login(P.email, 'wrong-password');
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ success: false, message: 'Invalid email or password' });
    }
    const raw = await User.collection.findOne({ _id: P.user._id });
    expect(raw.lockUntil.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    expect(raw.lockUntil.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);

    // Even the right password is refused, with the same generic response
    const locked = await login(P.email);
    expect(locked.status).toBe(401);
    expect(locked.body).toEqual({ success: false, message: 'Invalid email or password' });
    expect(await AuditLog.countDocuments({ action: 'auth.account_locked', entityId: P.user._id })).toBe(1);

    // Lock expired -> the right password works and the counters are reset
    await User.updateOne({ _id: P.user._id }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    const ok = await login(P.email);
    expect(ok.status).toBe(200);
    const after = await User.collection.findOne({ _id: P.user._id });
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockUntil).toBeNull();
  });

  test('a successful login resets the failure counter', async () => {
    const P = await newUser();
    for (let i = 0; i < 4; i += 1) await login(P.email, 'wrong-password');
    expect((await login(P.email)).status).toBe(200);
    for (let i = 0; i < 4; i += 1) await login(P.email, 'wrong-password');
    expect((await login(P.email)).status).toBe(200);
  });

  test('unknown emails get the same response and still run a bcrypt comparison', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');
    try {
      const r = await login(`nobody_${uid()}@example.com`, 'whatever-password');
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ success: false, message: 'Invalid email or password' });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('lock fields are never exposed by /me', async () => {
    const P = await createPharmacist();
    await login(P.email, 'wrong-password');
    const me = await request(app).get('/api/auth/me').set(auth(P.token));
    expect(me.status).toBe(200);
    expect(me.body.user.failedLoginCount).toBeUndefined();
    expect(me.body.user.lockUntil).toBeUndefined();
  });

  describe('2FA codes', () => {
    const codeFor = (secret) => generateTotp(secret, Math.floor(Date.now() / 1000));
    const enable2fa = async (P) => {
      const setup = await request(app).post('/api/auth/2fa/setup').set(auth(P.token)).send({ password: PASSWORD });
      const enable = await request(app).post('/api/auth/2fa/enable').set(auth(P.token))
        .send({ code: await codeFor(setup.body.secret) });
      expect(enable.status).toBe(200);
      P.token = enable.body.token;
      await User.updateOne({ _id: P.user._id }, { $set: { 'twoFactor.lastUsedStep': null } });
      return setup.body.secret;
    };
    const verify = (challengeToken, code) => request(app).post('/api/auth/login/2fa').send({ challengeToken, code });

    test('the challenge is invalidated after 5 wrong codes and the account is locked', async () => {
      const P = await createPharmacist();
      const secret = await enable2fa(P);
      const c = await login(P.email);
      expect(c.body.twoFactorRequired).toBe(true);

      for (let i = 0; i < 4; i += 1) {
        const r = await verify(c.body.challengeToken, '000000');
        expect(r.status).toBe(401);
        expect(r.body.code).toBe('INVALID_2FA_CODE');
      }
      const fifth = await verify(c.body.challengeToken, '000000');
      expect(fifth.status).toBe(401);
      expect(fifth.body.code).toBe('TWO_FACTOR_CHALLENGE_EXPIRED');

      // Even the right code no longer works with that challenge
      const late = await verify(c.body.challengeToken, await codeFor(secret));
      expect(late.status).toBe(401);
      expect(late.body.code).toBe('TWO_FACTOR_CHALLENGE_EXPIRED');

      // Wrong codes count toward the account lock
      const locked = await login(P.email);
      expect(locked.status).toBe(401);
      expect(locked.body.message).toBe('Invalid email or password');
    });

    test('wrong passwords and wrong codes share one counter', async () => {
      const P = await createPharmacist();
      await enable2fa(P);
      await login(P.email, 'wrong-password');
      await login(P.email, 'wrong-password');
      const c = await login(P.email);
      for (let i = 0; i < 2; i += 1) {
        expect((await verify(c.body.challengeToken, '000000')).body.code).toBe('INVALID_2FA_CODE');
      }
      const third = await verify(c.body.challengeToken, '000000');
      expect(third.body.code).toBe('TWO_FACTOR_CHALLENGE_EXPIRED'); // 5th failure locks
      expect((await login(P.email)).status).toBe(401);
    });

    test('a newer login replaces the previous challenge; a used challenge cannot be reused', async () => {
      const P = await createPharmacist();
      const secret = await enable2fa(P);
      const c1 = await login(P.email);
      const c2 = await login(P.email);
      expect((await verify(c1.body.challengeToken, await codeFor(secret))).status).toBe(401);
      const ok = await verify(c2.body.challengeToken, await codeFor(secret));
      expect(ok.status).toBe(200);
      await User.updateOne({ _id: P.user._id }, { $set: { 'twoFactor.lastUsedStep': null } });
      expect((await verify(c2.body.challengeToken, await codeFor(secret))).status).toBe(401);
    });

    test('a successful 2FA login resets the failure counter', async () => {
      const P = await createPharmacist();
      const secret = await enable2fa(P);
      await login(P.email, 'wrong-password');
      const c = await login(P.email);
      await verify(c.body.challengeToken, '000000');
      expect((await verify(c.body.challengeToken, await codeFor(secret))).status).toBe(200);
      const raw = await User.collection.findOne({ _id: P.user._id });
      expect(raw.failedLoginCount).toBe(0);
    });
  });
});

// --------------------------------------------------------------- 4. logout

describe('Logout and session revocation', () => {
  test('POST /api/auth/logout revokes the token server-side', async () => {
    const P = await createPharmacist();
    expect((await request(app).get('/api/auth/me').set(auth(P.token))).status).toBe(200);
    const out = await request(app).post('/api/auth/logout').set(auth(P.token));
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ success: true });
    expect((await request(app).get('/api/auth/me').set(auth(P.token))).status).toBe(401);
    expect((await request(app).post('/api/auth/logout').set(auth(P.token))).status).toBe(401);
    // A new login works
    const again = await login(P.email);
    expect((await request(app).get('/api/auth/me').set(auth(again.body.token))).status).toBe(200);
  });

  test('logout requires a token', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  });

  test('enabling / disabling 2FA signs out other sessions but returns a fresh token', async () => {
    const P = await createPharmacist();
    const other = (await login(P.email)).body.token;
    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(P.token)).send({ password: PASSWORD });
    const enable = await request(app).post('/api/auth/2fa/enable').set(auth(P.token))
      .send({ code: await generateTotp(setup.body.secret, Math.floor(Date.now() / 1000)) });
    expect(enable.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(other))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(P.token))).status).toBe(401);
    const fresh = enable.body.token;
    expect((await request(app).get('/api/auth/me').set(auth(fresh))).status).toBe(200);

    await User.updateOne({ _id: P.user._id }, { $set: { 'twoFactor.lastUsedStep': null } });
    const disable = await request(app).post('/api/auth/2fa/disable').set(auth(fresh))
      .send({ password: PASSWORD, code: await generateTotp(setup.body.secret, Math.floor(Date.now() / 1000)) });
    expect(disable.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(fresh))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(disable.body.token))).status).toBe(200);
  });
});

// ------------------------------------------------------------- 5. JWT alg

describe('JWT algorithm pinning', () => {
  test('tokens signed with another algorithm or unsigned are rejected', async () => {
    const P = await createPharmacist();
    const payload = { id: String(P.user._id), role: 'pharmacist', tv: 0 };
    const hs512 = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS512', expiresIn: '1h' });
    expect((await request(app).get('/api/auth/me').set(auth(hs512))).status).toBe(401);

    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...payload, iat: Math.floor(Date.now() / 1000) })}.`;
    expect((await request(app).get('/api/auth/me').set(auth(none))).status).toBe(401);

    const hs256 = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    expect((await request(app).get('/api/auth/me').set(auth(hs256))).status).toBe(200);
  });
});
