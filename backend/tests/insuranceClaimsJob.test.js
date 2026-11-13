// Monthly automatic insurance claims (jobs/insuranceClaimsJob.js) + member links to patients/customers.
const mongoose = require('mongoose');
const {
  app, request, auth, uid, daysFromNow,
  connectTestDb, disconnectTestDb, createPharmacist, createMedicine, insertBatchRaw,
} = require('./helpers');

const Sale = require('../models/Sale');
const InsuranceClaim = require('../models/InsuranceClaim');
const { runInsuranceClaims, claimTimeZone } = require('../jobs/insuranceClaimsJob');
const { previousMonthRange } = require('../services/insurance');

let A;
let B;

const api = (token) => ({
  get: (url) => request(app).get(url).set(auth(token)),
  post: (url, body) => request(app).post(url).set(auth(token)).send(body),
  put: (url, body) => request(app).put(url).set(auth(token)).send(body),
});

const createScheme = async (owner, overrides = {}) => {
  const res = await api(owner.token).post('/api/insurance/schemes', {
    name: `Scheme ${uid()}`, type: 'cbhi', coveragePercent: 100, copayType: 'none', ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.scheme;
};

const createMember = async (owner, schemeId, overrides = {}) => {
  const res = await api(owner.token).post('/api/insurance/members', {
    schemeId, memberNo: `M-${uid()}`, name: `Member ${uid()}`, validFrom: daysFromNow(-400), ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.member;
};

const stocked = async (pharmacyId) => {
  const med = await createMedicine(pharmacyId, { price: 10 });
  await insertBatchRaw(pharmacyId, med._id, { quantity: 500, expiryDate: daysFromNow(400) });
  return med;
};

// Insurance sale of `qty` x 10 ETB, moved to `date`.
const saleOn = async (owner, { scheme, member, med, qty = 1, date }) => {
  const res = await api(owner.token).post('/api/sales', {
    items: [{ medicineId: med._id, quantity: qty }],
    payments: [{ method: 'insurance', amount: 99999, schemeId: scheme._id, memberId: member._id }],
  });
  expect(res.status).toBe(201);
  if (date) {
    await Sale.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(res.body.sale._id)) }, { $set: { createdAt: date } });
  }
  return res.body.sale;
};

// Month edges follow the job's zone (JOBS_TZ, default Africa/Addis_Ababa), not the test machine's.
const HOUR_MS = 60 * 60 * 1000;
const now = new Date();
const { periodFrom, periodTo } = previousMonthRange(now, claimTimeZone());
const lastMonth = (day) => new Date(periodFrom.getTime() + (day - 1) * 24 * HOUR_MS + 10 * HOUR_MS);
const twoMonthsAgo = new Date(periodFrom.getTime() - 15 * 24 * HOUR_MS);
const thisMonth = new Date(periodTo.getTime() + 12 * HOUR_MS);

const rowsFor = (results, pharmacyId) => (results.find((r) => String(r.pharmacyId) === String(pharmacyId)) || { schemes: [] }).schemes;

beforeAll(async () => {
  await connectTestDb('insurance_claims_job');
  A = await createPharmacist();
  B = await createPharmacist();
});

afterAll(disconnectTestDb);

describe('previousMonthRange', () => {
  test('covers the whole previous calendar month, including across a year boundary', () => {
    const r = previousMonthRange(new Date(2026, 0, 1, 2, 0, 0));
    expect(r.periodFrom).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
    expect(r.periodTo).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
    const m = previousMonthRange(new Date(2026, 2, 31, 12));
    expect(m.periodFrom).toEqual(new Date(2026, 1, 1));
    expect(m.periodTo.getDate()).toBe(28);
  });
  test('uses the given time zone for month edges (Addis Ababa = UTC+3, no DST)', () => {
    // 1 Dec 2026 01:00 in Addis is still 30 Nov 22:00 UTC: the previous month must be November.
    const r = previousMonthRange(new Date('2026-11-30T22:00:00Z'), 'Africa/Addis_Ababa');
    expect(r.label).toBe('2026-11');
    expect(r.periodFrom.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(r.periodTo.toISOString()).toBe('2026-11-30T20:59:59.999Z');
    const jan = previousMonthRange(new Date('2027-01-10T12:00:00Z'), 'Africa/Addis_Ababa');
    expect(jan.label).toBe('2026-12');
    expect(jan.periodFrom.toISOString()).toBe('2026-11-30T21:00:00.000Z');
    expect(jan.periodTo.toISOString()).toBe('2026-12-31T20:59:59.999Z');
  });
});

describe('Monthly automatic claims job', () => {
  let schemeA;
  let schemeOff;
  let schemeB;
  const ids = {};

  beforeAll(async () => {
    schemeA = await createScheme(A);
    schemeOff = await createScheme(A, { autoClaim: false });
    expect(schemeOff.autoClaim).toBe(false);
    expect(schemeA.autoClaim).toBe(true);
    schemeB = await createScheme(B);

    const medA = await stocked(A.pharmacy._id);
    const medB = await stocked(B.pharmacy._id);
    const memberA = await createMember(A, schemeA._id);
    const memberOff = await createMember(A, schemeOff._id);
    const memberB = await createMember(B, schemeB._id);

    ids.a1 = (await saleOn(A, { scheme: schemeA, member: memberA, med: medA, qty: 2, date: lastMonth(1) }))._id;
    ids.a2 = (await saleOn(A, { scheme: schemeA, member: memberA, med: medA, qty: 3, date: lastMonth(20) }))._id;
    ids.aOld = (await saleOn(A, { scheme: schemeA, member: memberA, med: medA, qty: 1, date: twoMonthsAgo }))._id;
    ids.aNow = (await saleOn(A, { scheme: schemeA, member: memberA, med: medA, qty: 1, date: thisMonth }))._id;
    ids.off = (await saleOn(A, { scheme: schemeOff, member: memberOff, med: medA, qty: 1, date: lastMonth(5) }))._id;
    ids.b1 = (await saleOn(B, { scheme: schemeB, member: memberB, med: medB, qty: 4, date: lastMonth(10) }))._id;
  });

  test('creates one draft claim per scheme for last month only, scoped per pharmacy', async () => {
    const results = await runInsuranceClaims({ now });

    const rowsA = rowsFor(results, A.pharmacy._id);
    const createdA = rowsA.find((r) => String(r.schemeId) === schemeA._id);
    expect(createdA.status).toBe('created');
    expect(createdA.sales).toBe(2);
    expect(createdA.totalAmount).toBe(50);
    expect(rowsA.some((r) => String(r.schemeId) === schemeOff._id)).toBe(false);

    const claimA = await InsuranceClaim.findById(createdA.claimId).lean();
    expect(claimA.status).toBe('draft');
    expect(claimA.autoGenerated).toBe(true);
    expect(claimA.submittedAt).toBeNull();
    expect(String(claimA.pharmacyId)).toBe(String(A.pharmacy._id));
    expect(new Date(claimA.periodFrom)).toEqual(periodFrom);
    expect(new Date(claimA.periodTo)).toEqual(periodTo);
    expect(claimA.sales.map((s) => String(s.saleId)).sort()).toEqual([ids.a1, ids.a2].map(String).sort());

    // Outside last month: not claimed
    expect((await Sale.findById(ids.aOld)).insurance.claimId).toBeNull();
    expect((await Sale.findById(ids.aNow)).insurance.claimId).toBeNull();

    // Pharmacy B gets its own claim, with only its own sale
    const createdB = rowsFor(results, B.pharmacy._id).find((r) => String(r.schemeId) === schemeB._id);
    expect(createdB.status).toBe('created');
    const claimB = await InsuranceClaim.findById(createdB.claimId).lean();
    expect(String(claimB.pharmacyId)).toBe(String(B.pharmacy._id));
    expect(claimB.sales.map((s) => String(s.saleId))).toEqual([String(ids.b1)]);
    expect(claimB.totalAmount).toBe(40);

    // Visible through the API to its own pharmacy only
    const listA = await api(A.token).get('/api/insurance/claims');
    expect(listA.body.claims.some((c) => c._id === String(claimA._id))).toBe(true);
    expect(listA.body.claims.some((c) => c._id === String(claimB._id))).toBe(false);
    expect((await api(B.token).get(`/api/insurance/claims/${claimA._id}`)).status).toBe(404);
  });

  test('schemes with autoClaim false are skipped', async () => {
    expect((await Sale.findById(ids.off)).insurance.claimId).toBeNull();
    expect(await InsuranceClaim.countDocuments({ schemeId: schemeOff._id })).toBe(0);
  });

  test('is idempotent: running again creates nothing and never double-claims a sale', async () => {
    const before = await InsuranceClaim.countDocuments({});
    const results = await runInsuranceClaims({ now });
    expect(await InsuranceClaim.countDocuments({})).toBe(before);
    const rowA = rowsFor(results, A.pharmacy._id).find((r) => String(r.schemeId) === schemeA._id);
    expect(rowA.status).toBe('nothing');

    const claims = await InsuranceClaim.find({ schemeId: schemeA._id }).lean();
    const claimed = claims.flatMap((c) => c.sales.map((s) => String(s.saleId)));
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  test('a sale added later for last month is picked up by the next run in a new draft', async () => {
    const memberA = await createMember(A, schemeA._id);
    const med = await stocked(A.pharmacy._id);
    const late = await saleOn(A, { scheme: schemeA, member: memberA, med, qty: 1, date: lastMonth(25) });
    const results = await runInsuranceClaims({ now });
    const rowA = rowsFor(results, A.pharmacy._id).find((r) => String(r.schemeId) === schemeA._id);
    expect(rowA.status).toBe('created');
    expect(rowA.sales).toBe(1);
    expect(String((await Sale.findById(late._id)).insurance.claimId)).toBe(String(rowA.claimId));
  });

  test('autoClaim can be toggled through the scheme API', async () => {
    const res = await api(A.token).put(`/api/insurance/schemes/${schemeOff._id}`, { autoClaim: true });
    expect(res.status).toBe(200);
    expect(res.body.scheme.autoClaim).toBe(true);
    const results = await runInsuranceClaims({ now });
    const row = rowsFor(results, A.pharmacy._id).find((r) => String(r.schemeId) === schemeOff._id);
    expect(row.status).toBe('created');
    expect(row.sales).toBe(1);
  });
});

describe('Member links to patients and customers', () => {
  test('links a patient and a customer of the same pharmacy; rejects other pharmacies and bad ids', async () => {
    const scheme = await createScheme(A);
    const patient = await api(A.token).post('/api/patients', { name: `Patient ${uid()}`, phone: '0911000001' });
    expect(patient.status).toBe(201);
    const customer = await api(A.token).post('/api/customers', { name: `Customer ${uid()}`, phone: `09${String(Date.now()).slice(-8)}` });
    expect(customer.status).toBe(201);
    const patientB = await api(B.token).post('/api/patients', { name: `Patient B ${uid()}` });
    expect(patientB.status).toBe(201);

    const member = await createMember(A, scheme._id, {
      patientId: patient.body.patient._id,
      customerId: customer.body.customer._id,
    });
    expect(member.patientId).toBe(patient.body.patient._id);
    expect(member.customerId).toBe(customer.body.customer._id);

    const list = await api(A.token).get(`/api/insurance/members?schemeId=${scheme._id}`);
    const row = list.body.members.find((m) => m._id === member._id);
    expect(row.patientId.name).toBe(patient.body.patient.name);
    expect(row.customerId.name).toBe(customer.body.customer.name);

    const foreign = await api(A.token).post('/api/insurance/members', {
      schemeId: scheme._id, memberNo: `M-${uid()}`, name: 'X', patientId: patientB.body.patient._id,
    });
    expect(foreign.status).toBe(404);
    const bad = await api(A.token).put(`/api/insurance/members/${member._id}`, { customerId: 'not-an-id' });
    expect(bad.status).toBe(400);

    const unlink = await api(A.token).put(`/api/insurance/members/${member._id}`, { patientId: null, customerId: '' });
    expect(unlink.status).toBe(200);
    expect(unlink.body.member.patientId).toBeNull();
    expect(unlink.body.member.customerId).toBeNull();
  });
});

describe('On-demand schemes', () => {
  test('are never auto-claimed', async () => {
    const scheme = await createScheme(A, { claimCycle: 'on_demand' });
    const med = await stocked(A.pharmacy._id);
    const member = await createMember(A, scheme._id);
    const sale = await saleOn(A, { scheme, member, med, qty: 1, date: lastMonth(3) });
    await runInsuranceClaims();
    expect((await Sale.findById(sale._id)).insurance.claimId).toBeNull();
    expect(await InsuranceClaim.countDocuments({ schemeId: scheme._id })).toBe(0);
  });
});
