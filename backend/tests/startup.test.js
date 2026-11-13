// Start-up / ops helpers: 2FA encryption key check, index sync script.
const mongoose = require('mongoose');
const { connectTestDb, disconnectTestDb, uid } = require('./helpers');
const { checkEncryptionKeyConfig } = require('../utils/twoFactor');
const { syncIndexes } = require('../scripts/syncIndexes');

beforeAll(() => connectTestDb('startup'));
afterAll(disconnectTestDb);

describe('TWO_FACTOR_ENCRYPTION_KEY start-up check', () => {
  const count = (n) => async () => n;

  test('ok when the key is set', async () => {
    const r = await checkEncryptionKeyConfig({ env: { NODE_ENV: 'production', TWO_FACTOR_ENCRYPTION_KEY: 'x'.repeat(40) }, countTwoFactorUsers: count(5) });
    expect(r.level).toBe('ok');
  });

  test('fatal in production when 2FA users exist without the key', async () => {
    const r = await checkEncryptionKeyConfig({ env: { NODE_ENV: 'production' }, countTwoFactorUsers: count(2) });
    expect(r.level).toBe('fatal');
    expect(r.message).toMatch(/2 user\(s\)/);
  });

  test('only a warning without 2FA users or outside production', async () => {
    expect((await checkEncryptionKeyConfig({ env: { NODE_ENV: 'production' }, countTwoFactorUsers: count(0) })).level).toBe('warn');
    expect((await checkEncryptionKeyConfig({ env: { NODE_ENV: 'development' }, countTwoFactorUsers: count(3) })).level).toBe('warn');
  });
});

describe('scripts/syncIndexes', () => {
  const makeModel = () => {
    const schema = new mongoose.Schema({ a: String, b: String }, { autoIndex: false });
    schema.index({ a: 1 });
    return mongoose.model(`SyncIdx${uid()}`, schema);
  };

  test('dry run reports extra / missing indexes without changing anything; --apply honours --keep', async () => {
    const Model = makeModel();
    await Model.createCollection();
    await Model.collection.createIndex({ b: 1 }, { name: 'advisor_b' });
    await Model.collection.createIndex({ a: 1, b: 1 }, { name: 'old_ab' });
    const log = () => {};

    const [dry] = await syncIndexes({ models: [Model], log });
    expect(dry.toDrop.sort()).toEqual(['advisor_b', 'old_ab']);
    expect(dry.toCreate).toEqual([JSON.stringify({ a: 1 })]);
    let names = (await Model.collection.indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['advisor_b', 'old_ab']));
    expect(names).not.toContain('a_1');

    const [applied] = await syncIndexes({ models: [Model], apply: true, keep: ['advisor_b'], log });
    expect(applied.dropped).toEqual(['old_ab']);
    expect(applied.kept).toEqual(['advisor_b']);
    names = (await Model.collection.indexes()).map((i) => i.name);
    expect(names.sort()).toEqual(['_id_', 'a_1', 'advisor_b']);
  });
});
