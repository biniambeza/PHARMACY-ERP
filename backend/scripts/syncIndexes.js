#!/usr/bin/env node
// Compare / synchronise MongoDB indexes with the Mongoose schemas.
//
//   npm run db:sync-indexes                         # dry run: print what would be dropped / created
//   npm run db:sync-indexes -- --apply              # drop extra indexes, create missing ones
//   npm run db:sync-indexes -- --apply --keep=idx_a,idx_b   # never drop these index names
//   npm run db:sync-indexes -- --model=Sale,PurchaseOrder   # only these models
//
// Uses MONGO_URI (backend/.env). The server itself never drops indexes on boot: Mongoose
// autoIndex only creates missing ones. "Extra" indexes include obsolete ones from older
// versions (e.g. the global invoiceNumber_1 / poNumber_1 / owner_1 unique indexes) but also
// indexes added by hand or by the Atlas Performance Advisor: review the dry run first and
// pass --keep for any you want to keep (or add them to the schema). See docs/OPERATIONS.md.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseCliArgs } = require('./opsLib');

const MODELS_DIR = path.join(__dirname, '..', 'models');

const loadModels = () => {
  for (const file of fs.readdirSync(MODELS_DIR)) {
    if (file.endsWith('.js')) require(path.join(MODELS_DIR, file));
  }
  return mongoose.modelNames().map((n) => mongoose.model(n));
};

const splitList = (v) =>
  typeof v === 'string'
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/**
 * Computes (and with apply=true performs) the index changes for each model.
 * Returns [{ model, collection, toDrop, toCreate, kept, dropped, created }].
 */
const syncIndexes = async ({ models, apply = false, keep = [], log = console.log } = {}) => {
  const keepSet = new Set(keep);
  const report = [];
  for (const Model of models) {
    const collection = Model.collection.collectionName;
    // Missing collections are handled by Mongoose (everything is "to create").
    const diff = await Model.diffIndexes();
    const toDropAll = (diff.toDrop || []).map((d) => (typeof d === 'string' ? d : d.name));
    const kept = toDropAll.filter((n) => keepSet.has(n));
    const toDrop = toDropAll.filter((n) => !keepSet.has(n));
    const toCreate = (diff.toCreate || []).map((spec) => JSON.stringify(Array.isArray(spec) ? spec[0] : spec));
    const row = { model: Model.modelName, collection, toDrop, toCreate, kept, dropped: [], created: false };

    if (toDrop.length || toCreate.length || kept.length) {
      log(`${Model.modelName} (${collection})`);
      toDrop.forEach((n) => log(`  ${apply ? 'drop' : 'would drop'}   ${n}`));
      kept.forEach((n) => log(`  keep         ${n} (--keep)`));
      toCreate.forEach((k) => log(`  ${apply ? 'create' : 'would create'} ${k}`));
    }
    if (apply) {
      for (const name of toDrop) {
        await Model.collection.dropIndex(name);
        row.dropped.push(name);
      }
      if (toCreate.length) {
        await Model.createIndexes();
        row.created = true;
      }
    }
    report.push(row);
  }
  return report;
};

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/syncIndexes.js [--apply] [--keep=name1,name2] [--model=Model1,Model2]');
    return;
  }
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  const apply = args.apply === true || args.apply === 'true';
  // No automatic index builds while we compare.
  mongoose.set('autoIndex', false);
  await mongoose.connect(uri, { autoIndex: false });
  console.log(`Database "${mongoose.connection.db.databaseName}" - ${apply ? 'APPLYING changes' : 'dry run (pass --apply to change anything)'}`);

  let models = loadModels();
  const only = splitList(args.model);
  if (only.length) models = models.filter((M) => only.includes(M.modelName));

  const report = await syncIndexes({ models, apply, keep: splitList(args.keep) });
  const drops = report.reduce((s, r) => s + r.toDrop.length, 0);
  const creates = report.reduce((s, r) => s + r.toCreate.length, 0);
  console.log(
    drops || creates
      ? `${apply ? 'Done' : 'Would change'}: ${drops} index(es) to drop, ${creates} to create.`
      : 'Indexes already match the schemas.'
  );
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`Index sync failed: ${err.message}`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { syncIndexes, loadModels };
