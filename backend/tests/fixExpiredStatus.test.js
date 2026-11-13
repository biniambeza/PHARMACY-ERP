// scripts/fixExpiredStatus.js: batches wrongly marked 'expired' while still in date.
const { uid, daysFromNow, connectTestDb, disconnectTestDb, createMedicine, insertBatchRaw } = require('./helpers');
const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const { run } = require('../scripts/fixExpiredStatus');

beforeAll(() => connectTestDb('fixexpired'));
afterAll(() => disconnectTestDb());

test('dry run lists, --apply reactivates in-date batches and leaves really expired ones', async () => {
  const pharmacyId = new mongoose.Types.ObjectId();
  const med = await createMedicine(pharmacyId, { name: `Fix ${uid()}` });
  const wrongWithQty = await insertBatchRaw(pharmacyId, med._id, { quantity: 4, expiryDate: daysFromNow(200), status: 'expired' });
  const wrongEmpty = await insertBatchRaw(pharmacyId, med._id, { quantity: 0, expiryDate: daysFromNow(200), status: 'expired' });
  const reallyExpired = await insertBatchRaw(pharmacyId, med._id, { quantity: 3, expiryDate: daysFromNow(-5), status: 'expired' });

  const dry = await run();
  expect(dry.map((b) => String(b._id)).sort()).toEqual([String(wrongWithQty._id), String(wrongEmpty._id)].sort());
  expect((await StockBatch.findById(wrongWithQty._id)).status).toBe('expired');

  await run({ apply: true });
  expect((await StockBatch.findById(wrongWithQty._id)).status).toBe('active');
  expect((await StockBatch.findById(wrongEmpty._id)).status).toBe('depleted');
  expect((await StockBatch.findById(reallyExpired._id)).status).toBe('expired');
  expect(await run()).toHaveLength(0);
});

describe('errorHandler', () => {
  const { toHttpError } = require('../middleware/errorHandler');
  const AppError = require('../utils/AppError');
  test('passes machine-readable codes of operational errors, never Mongo numeric codes', () => {
    const e = new AppError('Shift was closed', 409);
    e.code = 'SHIFT_CLOSED';
    expect(toHttpError(e)).toEqual({ status: 409, message: 'Shift was closed', code: 'SHIFT_CLOSED' });
    expect(toHttpError(new AppError('x', 400)).code).toBeUndefined();
    const weird = new AppError('x', 400);
    weird.code = 'lower<script>';
    expect(toHttpError(weird).code).toBeUndefined();
  });
});
