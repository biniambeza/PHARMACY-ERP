const {
  app, request, auth,
  connectTestDb, disconnectTestDb, createPharmacist,
} = require('./helpers');
const Pharmacy = require('../models/Pharmacy');

beforeAll(() => connectTestDb('auth'));
afterAll(disconnectTestDb);

describe('Auth basics', () => {
  test('login with valid credentials returns a token and /api/auth/me works', async () => {
    const A = await createPharmacist();
    expect(typeof A.token).toBe('string');
    const me = await request(app).get('/api/auth/me').set(auth(A.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(A.email);
    expect(me.body.user.password).toBeUndefined();
  });

  test('login with a wrong password returns 401', async () => {
    const A = await createPharmacist({ login: false });
    const res = await request(app).post('/api/auth/login').send({ email: A.email, password: 'wrong-password-123' });
    expect(res.status).toBe(401);
  });

  test('request without a token returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Suspended pharmacies (#9)', () => {
  test('login for a suspended pharmacy returns 403', async () => {
    const S = await createPharmacist({ status: 'suspended', login: false });
    const res = await request(app).post('/api/auth/login').send({ email: S.email, password: S.password });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  test('an existing token stops working on /api/auth/me after the pharmacy is suspended', async () => {
    const P = await createPharmacist();
    const before = await request(app).get('/api/auth/me').set(auth(P.token));
    expect(before.status).toBe(200);

    await Pharmacy.updateOne({ _id: P.pharmacy._id }, { status: 'suspended' });

    const after = await request(app).get('/api/auth/me').set(auth(P.token));
    expect([401, 403]).toContain(after.status);
  });

  test('an existing token stops working on pharmacy routes after suspension', async () => {
    const P = await createPharmacist();
    await Pharmacy.updateOne({ _id: P.pharmacy._id }, { status: 'suspended' });
    const res = await request(app).get('/api/medicines').set(auth(P.token));
    expect([401, 403]).toContain(res.status);
  });
});
