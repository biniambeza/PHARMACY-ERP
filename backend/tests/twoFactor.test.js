const {
  app, request, auth, PASSWORD, uid,
  connectTestDb, disconnectTestDb, createPharmacist,
} = require('./helpers');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { generateTotp } = require('../utils/twoFactor');

beforeAll(() => connectTestDb('twofactor'));
afterAll(disconnectTestDb);

// TOTP code for the current time window shifted by `offsetSteps` (30 s each).
const codeFor = (secret, offsetSteps = 0) => generateTotp(secret, Math.floor(Date.now() / 1000) + offsetSteps * 30);

// Codes are single-use per time step; tests that need several codes in a row
// clear the replay marker instead of waiting for the next window.
const allowCodeReuse = (userId) => User.updateOne({ _id: userId }, { $set: { 'twoFactor.lastUsedStep': null } });

const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

async function enableTwoFactor(P) {
  const setup = await request(app).post('/api/auth/2fa/setup').set(auth(P.token)).send({ password: PASSWORD });
  expect(setup.status).toBe(200);
  const enable = await request(app)
    .post('/api/auth/2fa/enable')
    .set(auth(P.token))
    .send({ code: await codeFor(setup.body.secret) });
  expect(enable.status).toBe(200);
  // Enabling 2FA revokes older sessions; continue with the fresh token
  expect(typeof enable.body.token).toBe('string');
  P.token = enable.body.token;
  await allowCodeReuse(P.user._id);
  return { secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes };
}

async function createAdmin() {
  const id = uid();
  const email = `admin_${id}@example.com`;
  const user = await User.create({ name: `Admin ${id}`, email, password: PASSWORD, role: 'admin' });
  const res = await login(email);
  return { user, email, token: res.body.token };
}

describe('2FA setup and enable', () => {
  test('setup requires the current password', async () => {
    const P = await createPharmacist();
    const res = await request(app).post('/api/auth/2fa/setup').set(auth(P.token)).send({ password: 'wrong-password' });
    expect(res.status).toBe(400);
  });

  test('setup returns secret, otpauth URL and QR; enable returns recovery codes once', async () => {
    const P = await createPharmacist();

    const status0 = await request(app).get('/api/auth/2fa/status').set(auth(P.token));
    expect(status0.status).toBe(200);
    expect(status0.body.enabled).toBe(false);
    expect(status0.body.recommended).toBe(true); // owner

    const setup = await request(app).post('/api/auth/2fa/setup').set(auth(P.token)).send({ password: PASSWORD });
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.body.qrCode).toMatch(/^data:image\/png;base64,/);

    // Wrong code does not enable
    const bad = await request(app).post('/api/auth/2fa/enable').set(auth(P.token)).send({ code: '000000' });
    expect(bad.status).toBe(400);

    const enable = await request(app)
      .post('/api/auth/2fa/enable')
      .set(auth(P.token))
      .send({ code: await codeFor(setup.body.secret) });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(8);

    // Secret and recovery codes are never stored in clear nor returned
    const raw = await User.collection.findOne({ _id: P.user._id });
    expect(raw.twoFactor.enabled).toBe(true);
    expect(raw.twoFactor.secret).not.toContain(setup.body.secret);
    expect(JSON.stringify(raw.twoFactor.recoveryCodes)).not.toContain(enable.body.recoveryCodes[0]);

    // Enabling revokes older sessions (the old token) and returns a fresh token
    expect((await request(app).get('/api/auth/me').set(auth(P.token))).status).toBe(401);
    P.token = enable.body.token;

    const me = await request(app).get('/api/auth/me').set(auth(P.token));
    expect(me.status).toBe(200);
    expect(me.body.user.twoFactor.enabled).toBe(true);
    expect(me.body.user.twoFactor.secret).toBeUndefined();
    expect(me.body.user.twoFactor.recoveryCodes).toBeUndefined();
    expect(JSON.stringify(me.body)).not.toContain(raw.twoFactor.secret);

    const status = await request(app).get('/api/auth/2fa/status').set(auth(P.token));
    expect(status.body).toMatchObject({ enabled: true, recoveryCodesRemaining: 8 });

    const audits = await AuditLog.find({ userId: P.user._id, action: 'auth.2fa_enabled' });
    expect(audits).toHaveLength(1);
  });
});

describe('2FA login challenge', () => {
  test('password login returns a challenge instead of a token; code completes it', async () => {
    const P = await createPharmacist();
    const { secret } = await enableTwoFactor(P);

    const first = await login(P.email);
    expect(first.status).toBe(200);
    expect(first.body.twoFactorRequired).toBe(true);
    expect(typeof first.body.challengeToken).toBe('string');
    expect(first.body.token).toBeUndefined();
    expect(first.body.user).toBeUndefined();

    // Wrong code
    const wrong = await request(app).post('/api/auth/login/2fa').send({ challengeToken: first.body.challengeToken, code: '123456' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.token).toBeUndefined();

    const ok = await request(app)
      .post('/api/auth/login/2fa')
      .send({ challengeToken: first.body.challengeToken, code: await codeFor(secret) });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
    expect(ok.body.user.email).toBe(P.email);
    expect(ok.body.user.twoFactorEnabled).toBe(true);
    expect(Array.isArray(ok.body.memberships)).toBe(true);
    expect(ok.body.memberships[0].role).toBe('owner');

    const me = await request(app).get('/api/auth/me').set(auth(ok.body.token));
    expect(me.status).toBe(200);
  });

  test('the same TOTP code cannot be used twice', async () => {
    const P = await createPharmacist();
    const { secret } = await enableTwoFactor(P);
    const code = await codeFor(secret);

    const c1 = await login(P.email);
    const ok = await request(app).post('/api/auth/login/2fa').send({ challengeToken: c1.body.challengeToken, code });
    expect(ok.status).toBe(200);

    const c2 = await login(P.email);
    const replay = await request(app).post('/api/auth/login/2fa').send({ challengeToken: c2.body.challengeToken, code });
    expect(replay.status).toBe(401);
  });

  test('a code from the previous time window is accepted (clock drift)', async () => {
    const P = await createPharmacist();
    const { secret } = await enableTwoFactor(P);
    const c = await login(P.email);
    const res = await request(app)
      .post('/api/auth/login/2fa')
      .send({ challengeToken: c.body.challengeToken, code: await codeFor(secret, -1) });
    expect(res.status).toBe(200);
  });

  test('the challenge token cannot be used as a session token', async () => {
    const P = await createPharmacist();
    await enableTwoFactor(P);
    const c = await login(P.email);
    const challenge = c.body.challengeToken;

    const me = await request(app).get('/api/auth/me').set(auth(challenge));
    expect(me.status).toBe(401);
    const meds = await request(app).get('/api/medicines').set(auth(challenge));
    expect(meds.status).toBe(401);
    const status = await request(app).get('/api/auth/2fa/status').set(auth(challenge));
    expect(status.status).toBe(401);
  });

  test('an invalid or tampered challenge token is rejected', async () => {
    const res = await request(app).post('/api/auth/login/2fa').send({ challengeToken: 'not-a-token', code: '123456' });
    expect(res.status).toBe(401);

    // A normal session token is not a challenge token either
    const P = await createPharmacist();
    const res2 = await request(app).post('/api/auth/login/2fa').send({ challengeToken: P.token, code: '123456' });
    expect(res2.status).toBe(401);
  });

  test('recovery codes work once only', async () => {
    const P = await createPharmacist();
    const { recoveryCodes } = await enableTwoFactor(P);

    const c1 = await login(P.email);
    const ok = await request(app)
      .post('/api/auth/login/2fa')
      .send({ challengeToken: c1.body.challengeToken, recoveryCode: recoveryCodes[0].toUpperCase() });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
    expect(ok.body.recoveryCodesRemaining).toBe(7);

    const c2 = await login(P.email);
    const again = await request(app)
      .post('/api/auth/login/2fa')
      .send({ challengeToken: c2.body.challengeToken, recoveryCode: recoveryCodes[0] });
    expect(again.status).toBe(401);

    const status = await request(app).get('/api/auth/2fa/status').set(auth(ok.body.token));
    expect(status.body.recoveryCodesRemaining).toBe(7);
  });
});

describe('2FA disable and admin reset', () => {
  test('disable needs password and a valid code', async () => {
    const P = await createPharmacist();
    const { secret } = await enableTwoFactor(P);

    const noPw = await request(app).post('/api/auth/2fa/disable').set(auth(P.token)).send({ code: await codeFor(secret) });
    expect(noPw.status).toBe(400);
    await allowCodeReuse(P.user._id);

    const badCode = await request(app)
      .post('/api/auth/2fa/disable')
      .set(auth(P.token))
      .send({ password: PASSWORD, code: '000000' });
    expect(badCode.status).toBe(400);

    const ok = await request(app)
      .post('/api/auth/2fa/disable')
      .set(auth(P.token))
      .send({ password: PASSWORD, code: await codeFor(secret) });
    expect(ok.status).toBe(200);

    const raw = await User.collection.findOne({ _id: P.user._id });
    expect(raw.twoFactor.enabled).toBe(false);
    expect(raw.twoFactor.secret).toBeUndefined();

    const res = await login(P.email);
    expect(res.body.twoFactorRequired).toBeUndefined();
    expect(typeof res.body.token).toBe('string');

    expect(await AuditLog.countDocuments({ userId: P.user._id, action: 'auth.2fa_disabled' })).toBe(1);
  });

  test('disable also accepts a recovery code', async () => {
    const P = await createPharmacist();
    const { recoveryCodes } = await enableTwoFactor(P);
    const ok = await request(app)
      .post('/api/auth/2fa/disable')
      .set(auth(P.token))
      .send({ password: PASSWORD, recoveryCode: recoveryCodes[3] });
    expect(ok.status).toBe(200);
  });

  test('platform admin can reset a user 2FA (audited); non-admins cannot', async () => {
    const P = await createPharmacist();
    await enableTwoFactor(P);
    const other = await createPharmacist();

    const denied = await request(app).post(`/api/auth/admin-reset-2fa/${P.user._id}`).set(auth(other.token));
    expect(denied.status).toBe(403);

    const A = await createAdmin();
    const res = await request(app).post(`/api/auth/admin-reset-2fa/${P.user._id}`).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.wasEnabled).toBe(true);

    // Old sessions are revoked; password login works without a second step
    const me = await request(app).get('/api/auth/me').set(auth(P.token));
    expect(me.status).toBe(401);
    const again = await login(P.email);
    expect(typeof again.body.token).toBe('string');

    const log = await AuditLog.findOne({ action: 'auth.admin_reset_2fa', entityId: P.user._id });
    expect(log).not.toBeNull();
    expect(String(log.userId)).toBe(String(A.user._id));
  });

  test('admins can use 2FA themselves', async () => {
    const A = await createAdmin();
    const { secret } = await enableTwoFactor({ user: A.user, token: A.token });
    const c = await login(A.email);
    expect(c.body.twoFactorRequired).toBe(true);
    const ok = await request(app)
      .post('/api/auth/login/2fa')
      .send({ challengeToken: c.body.challengeToken, code: await codeFor(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('admin');
    expect(ok.body.memberships).toEqual([]);
  });
});
