const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');

const Supplier = require('../models/Supplier');
const User = require('../models/User');

let A;

const status = async (token) => {
  const res = await request(app).get('/api/onboarding/status').set(auth(token));
  expect(res.status).toBe(200);
  return res.body.onboarding;
};
const step = (ob, key) => ob.steps.find((s) => s.key === key);

beforeAll(async () => {
  await connectTestDb('onboarding');
  A = await createPharmacist();
});

afterAll(disconnectTestDb);

describe('GET /api/onboarding/status', () => {
  test('a new pharmacy starts with an incomplete checklist shown to the owner', async () => {
    const ob = await status(A.token);
    expect(ob.show).toBe(true);
    expect(ob.complete).toBe(false);
    expect(ob.canDismiss).toBe(true);
    expect(step(ob, 'business').done).toBe(false); // no TIN yet
    expect(step(ob, 'business').link).toBe('/pharmacy/einvoice');
    expect(step(ob, 'medicines').done).toBe(false);
    expect(step(ob, 'staff').optional).toBe(true);
    expect(step(ob, 'shift')).toBeUndefined(); // shifts not required
    expect(step(ob, 'twoFactor').done).toBe(false);
  });

  test('steps complete as data is created', async () => {
    await request(app).put('/api/pharmacy/my-pharmacy').set(auth(A.token))
      .send({ tin: '0011223344', settings: { currency: 'ETB', tax: { enabled: true } } });
    const med = await createMedicine(A.pharmacy._id);
    await insertBatchRaw(A.pharmacy._id, med._id, { quantity: 10, expiryDate: daysFromNow(200) });
    await Supplier.create({ pharmacyId: A.pharmacy._id, name: `Sup ${uid()}`, contactPerson: 'X', phone: '0911', email: `s${uid()}@x.com`, address: 'Addis' });
    const sale = await request(app).post('/api/sales').set(auth(A.token))
      .send({ paymentMethod: 'cash', items: [{ medicineId: med._id, quantity: 1 }] });
    expect(sale.status).toBe(201);

    const ob = await status(A.token);
    ['business', 'currencyTax', 'medicines', 'stock', 'supplier', 'sale'].forEach((k) => {
      expect({ k, done: step(ob, k).done }).toEqual({ k, done: true });
    });
    expect(ob.complete).toBe(true);
    expect(ob.show).toBe(false);
    expect(ob.percent).toBeLessThan(100); // optional steps remain

    // Optional: staff and 2FA
    const email = `ph_${uid()}@example.com`;
    await request(app).post('/api/staff').set(auth(A.token)).send({ name: 'P', email, password: PASSWORD, role: 'pharmacist' });
    await User.collection.updateOne({ _id: A.user._id }, { $set: { twoFactor: { enabled: true } } });
    const ob2 = await status(A.token);
    expect(step(ob2, 'staff').done).toBe(true);
    expect(step(ob2, 'twoFactor').done).toBe(true);
    expect(ob2.percent).toBe(100);

    // Non-owner: never shown, cannot dismiss
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const ob3 = await status(login.body.token);
    expect(ob3.show).toBe(false);
    expect(ob3.canDismiss).toBe(false);
    expect((await request(app).post('/api/onboarding/dismiss').set(auth(login.body.token))).status).toBe(403);
  });

  test('requireShift adds the shift step', async () => {
    await request(app).put('/api/pharmacy/my-pharmacy').set(auth(A.token)).send({ settings: { requireShift: true } });
    const ob = await status(A.token);
    expect(step(ob, 'shift')).toMatchObject({ done: false, optional: true });
  });
});

describe('dismiss', () => {
  test('owner can dismiss and restore the checklist', async () => {
    const B = await createPharmacist();
    const res = await request(app).post('/api/onboarding/dismiss').set(auth(B.token));
    expect(res.status).toBe(200);
    expect(res.body.onboarding.dismissed).toBe(true);
    expect(res.body.onboarding.show).toBe(false);
    expect((await status(B.token)).dismissedAt).toBeTruthy();

    const restored = await request(app).delete('/api/onboarding/dismiss').set(auth(B.token));
    expect(restored.body.onboarding.show).toBe(true);
    // Tenant isolation: A's state is unaffected by B
    expect((await status(A.token)).dismissed).toBe(false);
  });
});
