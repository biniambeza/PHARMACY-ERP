#!/usr/bin/env node
// Copy a whole database (documents, collection options, indexes, views) to another
// database on the same cluster (the host in MONGO_URI). Use it to make a test copy
// of production before deploying an upgrade (see docs/OPERATIONS.md).
//
//   npm run db:clone -- --from pharmacy-erp --to pharmacy-erp-upgrade-test
//   npm run db:clone -- --from pharmacy-erp --to pharmacy-erp-upgrade-test --force
//
// Safety:
//   - refuses when --to equals --from, or either is admin/local/config;
//   - refuses to overwrite a target that already has collections unless --force
//     (which drops the target database first);
//   - refuses when --to is the database MONGO_URI itself points to (the live app
//     database) unless --allow-live-target;
//   - the source is only read, never written.
const mongoose = require('mongoose');
const { connect } = require('./backupLib');
const { parseCliArgs, assertCloneArgs, cloneDatabase } = require('./opsLib');

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help || typeof args.from !== 'string' || typeof args.to !== 'string') {
    console.log('Usage: node scripts/cloneDatabase.js --from <db> --to <db> [--force]');
    if (!args.help) process.exitCode = 1;
    return;
  }
  // Validate before connecting so obvious mistakes fail fast.
  assertCloneArgs({ from: args.from, to: args.to });
  const db = await connect();
  if (db.databaseName.toLowerCase() === args.to.toLowerCase() && !args['allow-live-target']) {
    throw new Error(
      `--to "${args.to}" is the database MONGO_URI points to (the app's live database). ` +
        'Point MONGO_URI elsewhere, or pass --allow-live-target if you really mean it.'
    );
  }
  console.log(`Cloning "${args.from}" -> "${args.to}"${args.force ? ' (--force)' : ''}...`);
  const report = await cloneDatabase({
    client: mongoose.connection.getClient(),
    from: args.from,
    to: args.to,
    force: !!args.force,
    log: (line) => console.log(line),
  });
  const total = Object.values(report.collections).reduce((s, c) => s + c.target, 0);
  console.log('--------------------------------------------------');
  console.log(
    `${report.ok ? 'Done' : 'Done WITH MISMATCHES'}: ${Object.keys(report.collections).length} collections, ` +
      `${report.views.length} views, ${total} documents copied to "${args.to}".`
  );
  if (!report.ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`Clone failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
