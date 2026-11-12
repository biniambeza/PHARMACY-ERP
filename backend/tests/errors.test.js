const {
  app, request, auth,
  connectTestDb, disconnectTestDb, createPharmacist,
} = require('./helpers');
const Medicine = require('../models/Medicine');

let A;

beforeAll(async () => {
  await connectTestDb('errors');
  A = await createPharmacist();
});

afterAll(async () => {
  jest.restoreAllMocks();
  await disconnectTestDb();
});

describe('Error responses (#10)', () => {
  test('a 500 does not leak internal error details', async () => {
    const secret = 'SECRET_INTERNAL_DETAIL connection string mongodb://user:pass@host';
    jest.spyOn(Medicine, 'find').mockImplementation(() => { throw new Error(secret); });
    jest.spyOn(Medicine, 'countDocuments').mockImplementation(() => { throw new Error(secret); });
    jest.spyOn(Medicine, 'aggregate').mockImplementation(() => { throw new Error(secret); });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/api/medicines').set(auth(A.token));

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SECRET_INTERNAL_DETAIL');
    expect(res.body.success).toBe(false);
    jest.restoreAllMocks();
  });

  test('an invalid ObjectId returns 400 or 404, not 500', async () => {
    const res = await request(app).get('/api/medicines/not-an-id').set(auth(A.token));
    expect([400, 404]).toContain(res.status);
  });

  test('unknown route returns 404 JSON', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
