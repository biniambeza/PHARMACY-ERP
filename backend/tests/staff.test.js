const {
  app, request, auth, uid, daysFromNow, PASSWORD,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const AuditLog = require('../models/AuditLog');
const { can, PERMISSIONS } = require('../config/permissions');

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res;
};

let O; // owner (created through the legacy helper: no memberships)
let cashier;

beforeAll(async () => {
  await connectTestDb('staff');
  O = await createPharmacist();
});

afterAll(disconnectTestDb);

describe('Permission matrix', () => {
  test('owner has everything, cashier is limited', () => {
    expect(can('owner', 'staff:manage')).toBe(true);
    expect(can('pharmacist', 'staff:manage')).toBe(false);
    expect(can('pharmacist', 'medicine:manage')).toBe(true);
    expect(can('cashier', 'sales:create')).toBe(true);
    expect(can('cashier', 'medicine:manage')).toBe(false);
    expect(can('storekeeper', 'po:receive')).toBe(true);
    expect(can(undefined, 'sales:create')).toBe(false);
    expect(PERMISSIONS.owner.length).toBeGreaterThan(PERMISSIONS.pharmacist.length);
  });
});

describe('Legacy owner migration', () => {
  test('legacy owner login returns an owner membership and it is persisted', async () => {
    const id = uid();
    const user = await User.create({ name: 'Legacy', email: `legacy_${id}@example.com`, password: PASSWORD });
    const pharmacy = await Pharmacy.create({
      name: `Legacy ${id}`, address: 'x', phone: '1', licenseNo: `LEG-${id}`, owner: user._id,
    });
    expect((await User.findById(user._id)).memberships).toHaveLength(0);

    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].role).toBe('owner');
    expect(String(res.body.memberships[0].pharmacyId)).toBe(String(pharmacy._id));
    expect(res.body.memberships[0].pharmacy.name).toBe(pharmacy.name);

    const saved = await User.findById(user._id);
    expect(saved.memberships).toHaveLength(1);
    expect(saved.memberships[0].role).toBe('owner');

    const meds = await request(app).get('/api/medicines').set(auth(res.body.token));
    expect(meds.status).toBe(200);
  });

  test('legacy owner without memberships works on pharmacy routes without logging in again', async () => {
    const id = uid();
    const user = await User.create({ name: 'Legacy2', email: `legacy2_${id}@example.com`, password: PASSWORD });
    await Pharmacy.create({ name: `L2 ${id}`, address: 'x', phone: '1', licenseNo: `LEG2-${id}`, owner: user._id });
    const generateToken = require('../utils/generateToken');
    const token = generateToken(user._id, 'pharmacist', 0);
    const res = await request(app).get('/api/staff').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.staff.some((s) => s.role === 'owner' && s.email === user.email)).toBe(true);
  });
});

describe('Staff management', () => {
  test('owner creates a cashier', async () => {
    const res = await request(app).post('/api/staff').set(auth(O.token)).send({
      name: 'Cash Ier', email: `cashier_${uid()}@example.com`, password: 'TempPass123', role: 'cashier',
    });
    expect(res.status).toBe(201);
    expect(res.body.staff.role).toBe('cashier');
    expect(res.body.staff.active).toBe(true);

    const loginRes = await login(res.body.staff.email, 'TempPass123');
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.memberships[0].role).toBe('cashier');
    cashier = { ...res.body.staff, token: loginRes.body.token };

    expect(await AuditLog.exists({ action: 'staff.create', entityId: cashier._id })).toBeTruthy();
  });

  test('rejects short passwords and invalid roles', async () => {
    const short = await request(app).post('/api/staff').set(auth(O.token))
      .send({ name: 'X', email: `x_${uid()}@example.com`, password: 'short', role: 'cashier' });
    expect(short.status).toBe(400);
    const badRole = await request(app).post('/api/staff').set(auth(O.token))
      .send({ name: 'X', email: `x_${uid()}@example.com`, password: 'LongEnough1', role: 'admin' });
    expect(badRole.status).toBe(400);
  });

  test('owner lists staff', async () => {
    const res = await request(app).get('/api/staff').set(auth(O.token));
    expect(res.status).toBe(200);
    const roles = res.body.staff.map((s) => s.role);
    expect(roles).toContain('owner');
    expect(roles).toContain('cashier');
  });

  test('cashier can sell but not manage medicines, view reports or manage staff', async () => {
    const med = await createMedicine(O.pharmacy._id);
    await insertBatchRaw(O.pharmacy._id, med._id, { quantity: 20, expiryDate: daysFromNow(200) });

    const sale = await request(app).post('/api/sales').set(auth(cashier.token))
      .send({ items: [{ medicineId: med._id, quantity: 1 }], paymentMethod: 'cash' });
    expect(sale.status).toBe(201);
    expect(String(sale.body.sale.staffId)).toBe(String(cashier._id));

    const list = await request(app).get('/api/medicines').set(auth(cashier.token));
    expect(list.status).toBe(200);

    // POS batch lookup is allowed, inventory management is not
    expect((await request(app).get('/api/stock').set(auth(cashier.token))).status).toBe(200);
    expect((await request(app).get('/api/stock/summary').set(auth(cashier.token))).status).toBe(403);
    expect((await request(app).post('/api/procurement/orders').set(auth(cashier.token)).send({})).status).toBe(403);

    const createMed = await request(app).post('/api/medicines').set(auth(cashier.token))
      .send({ name: `Nope ${uid()}`, category: 'X', price: 1 });
    expect(createMed.status).toBe(403);

    const reports = await request(app).get('/api/reports/analytics').set(auth(cashier.token));
    expect(reports.status).toBe(403);

    const staff = await request(app).get('/api/staff').set(auth(cashier.token));
    expect(staff.status).toBe(403);
  });

  test('owner changes role; cannot demote the last owner', async () => {
    const res = await request(app).patch(`/api/staff/${cashier._id}/role`).set(auth(O.token))
      .send({ role: 'storekeeper' });
    expect(res.status).toBe(200);
    expect(res.body.staff.role).toBe('storekeeper');

    const demote = await request(app).patch(`/api/staff/${O.user._id}/role`).set(auth(O.token))
      .send({ role: 'pharmacist' });
    expect(demote.status).toBe(400);

    const deactivateSelf = await request(app).patch(`/api/staff/${O.user._id}/deactivate`).set(auth(O.token));
    expect(deactivateSelf.status).toBe(400);
  });

  test('deactivated staff token is rejected and login refused; reactivation restores access', async () => {
    const before = await request(app).get('/api/medicines').set(auth(cashier.token));
    expect(before.status).toBe(200);

    const res = await request(app).patch(`/api/staff/${cashier._id}/deactivate`).set(auth(O.token));
    expect(res.status).toBe(200);
    expect(res.body.staff.active).toBe(false);

    const after = await request(app).get('/api/medicines').set(auth(cashier.token));
    expect([401, 403]).toContain(after.status);

    const relogin = await login(cashier.email, 'TempPass123');
    expect(relogin.status).toBe(403);

    const re = await request(app).patch(`/api/staff/${cashier._id}/reactivate`).set(auth(O.token));
    expect(re.status).toBe(200);
    const back = await login(cashier.email, 'TempPass123');
    expect(back.status).toBe(200);
    cashier.token = back.body.token;
    expect((await request(app).get('/api/medicines').set(auth(cashier.token))).status).toBe(200);
  });

  test('cannot manage a user of another pharmacy', async () => {
    const other = await createPharmacist();
    const res = await request(app).patch(`/api/staff/${other.user._id}/role`).set(auth(O.token))
      .send({ role: 'cashier' });
    expect(res.status).toBe(404);
  });
});

describe('Branches and x-pharmacy-id', () => {
  test('x-pharmacy-id of a pharmacy without membership -> 403; invalid id -> 400', async () => {
    const other = await createPharmacist();
    const res = await request(app).get('/api/medicines').set(auth(O.token))
      .set('x-pharmacy-id', String(other.pharmacy._id));
    expect(res.status).toBe(403);

    const bad = await request(app).get('/api/medicines').set(auth(O.token)).set('x-pharmacy-id', 'nope');
    expect(bad.status).toBe(400);
  });

  test('owner creates a branch and switches to it', async () => {
    const id = uid();
    const res = await request(app).post('/api/branches').set(auth(O.token)).send({
      name: `Branch ${id}`, address: 'Branch street', phone: '0911', licenseNo: `BR-${id}`,
    });
    expect(res.status).toBe(201);
    const branchId = String(res.body.branch._id);
    expect(res.body.organizationId).toBeTruthy();

    const original = await Pharmacy.findById(O.pharmacy._id);
    expect(String(original.organizationId)).toBe(String(res.body.organizationId));

    const branches = await request(app).get('/api/branches').set(auth(O.token));
    expect(branches.status).toBe(200);
    expect(branches.body.branches.map((b) => String(b.pharmacyId))).toContain(branchId);

    // Data is isolated per branch
    const med = await request(app).post('/api/medicines').set(auth(O.token)).set('x-pharmacy-id', branchId)
      .send({ name: `BranchMed ${id}`, category: 'X', price: 3 });
    expect(med.status).toBe(201);
    expect(String(med.body.medicine.pharmacyId)).toBe(branchId);

    const mainList = await request(app).get('/api/medicines').set(auth(O.token))
      .set('x-pharmacy-id', String(O.pharmacy._id));
    expect(mainList.body.medicines.some((m) => m.name === `BranchMed ${id}`)).toBe(false);

    // Cashier of the main pharmacy cannot use the new branch
    const denied = await request(app).get('/api/medicines').set(auth(cashier.token)).set('x-pharmacy-id', branchId);
    expect(denied.status).toBe(403);
  });

  test('cashier cannot create branches', async () => {
    const id = uid();
    const res = await request(app).post('/api/branches').set(auth(cashier.token)).send({
      name: `B ${id}`, address: 'a', phone: '1', licenseNo: `BRX-${id}`,
    });
    expect(res.status).toBe(403);
  });
});

describe('Admin createPharmacy', () => {
  test('creates organization and owner membership', async () => {
    const adminId = uid();
    await User.create({ name: 'Admin', email: `admin_${adminId}@example.com`, password: PASSWORD, role: 'admin' });
    const adminLogin = await login(`admin_${adminId}@example.com`);
    expect(adminLogin.status).toBe(200);

    const id = uid();
    const res = await request(app).post('/api/admin/pharmacies').set(auth(adminLogin.body.token)).send({
      name: `Adm ${id}`, address: 'a', phone: '1', licenseNo: `ADM-${id}`,
      pharmacistName: 'Owner', pharmacistEmail: `owner_${id}@example.com`, pharmacistPassword: PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.pharmacy.organizationId).toBeTruthy();

    const owner = await User.findOne({ email: `owner_${id}@example.com` });
    expect(owner.memberships).toHaveLength(1);
    expect(owner.memberships[0].role).toBe('owner');
    expect(String(owner.organizationId)).toBe(String(res.body.pharmacy.organizationId));
  });
});
