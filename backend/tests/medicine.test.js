const {
  app, request, auth,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine,
} = require('./helpers');
const Medicine = require('../models/Medicine');

let A;
let B;

beforeAll(async () => {
  await connectTestDb('medicine');
  A = await createPharmacist();
  B = await createPharmacist();
});

afterAll(disconnectTestDb);

describe('PUT /api/medicines/:id - field whitelist (#7)', () => {
  test('non-whitelisted fields (pharmacyId, createdAt) are ignored, allowed fields are updated', async () => {
    const med = await createMedicine(A.pharmacy._id, { price: 10 });
    const originalCreatedAt = med.createdAt.toISOString();

    const res = await request(app).put(`/api/medicines/${med._id}`).set(auth(A.token)).send({
      price: 12,
      pharmacyId: B.pharmacy._id,
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(200);
    const stored = await Medicine.findById(med._id);
    expect(stored.price).toBe(12);
    expect(String(stored.pharmacyId)).toBe(String(A.pharmacy._id));
    expect(stored.createdAt.toISOString()).toBe(originalCreatedAt);

    // Still visible to A, not to B
    expect((await request(app).get(`/api/medicines/${med._id}`).set(auth(A.token))).status).toBe(200);
    expect((await request(app).get(`/api/medicines/${med._id}`).set(auth(B.token))).status).toBe(404);
  });
});

describe('Regex-safe search (#8)', () => {
  beforeAll(async () => {
    await createMedicine(A.pharmacy._id, { name: 'Paracetamol 500', genericName: 'acetaminophen' });
    await createMedicine(A.pharmacy._id, { name: 'Ibuprofen 400', genericName: 'ibuprofen' });
  });

  test.each(['(a+)+$', '.*', '[', '\\'])('search=%s returns 200 and does not match everything', async (term) => {
    const res = await request(app).get('/api/medicines').query({ search: term }).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.medicines).toHaveLength(0);
  });

  test('a plain search term still matches case-insensitively', async () => {
    const res = await request(app).get('/api/medicines').query({ search: 'paraCET' }).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.medicines.map((m) => m.name)).toEqual(['Paracetamol 500']);
  });

  test('supplier search with regex metacharacters returns 200', async () => {
    const res = await request(app).get('/api/suppliers').query({ search: '(a+)+$' }).set(auth(A.token));
    expect(res.status).toBe(200);
  });

  test('purchase order search with regex metacharacters returns 200', async () => {
    const res = await request(app).get('/api/procurement/orders').query({ search: '.*' }).set(auth(A.token));
    expect(res.status).toBe(200);
  });

  test('a medicine named "Para.*" does not block creating "Paracetamol XR" as a duplicate', async () => {
    const first = await request(app).post('/api/medicines').set(auth(A.token))
      .send({ name: 'Para.*', category: 'Analgesic', price: 1 });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/medicines').set(auth(A.token))
      .send({ name: 'Paracetamol XR', category: 'Analgesic', price: 1 });
    expect(second.status).toBe(201);
  });

  test('creating a true duplicate name (different case) is still rejected', async () => {
    const res = await request(app).post('/api/medicines').set(auth(A.token))
      .send({ name: 'IBUPROFEN 400', category: 'Analgesic', price: 1 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
