#!/usr/bin/env node
// Restore a backup folder produced by scripts/backup.js (#28).
//
//   npm run restore -- --dir=backups/backup-20261113-020000 --dry-run
//   npm run restore -- --dir=<folder> --confirm=<target database name>
//   npm run restore -- --dir=<folder> --confirm=<db> --mode=replace --collections=medicines,stockbatches
//
// Modes:
//   upsert  (default) replace documents by _id and insert missing ones; nothing is deleted.
//   replace delete everything in the backup's scope first (whole collections, or only that
//           pharmacy's documents for a --pharmacy backup), then insert the backup.
// Safety: without --dry-run the restore only runs when --confirm equals the name of the
// database MONGO_URI points to. Take a fresh backup first. Indexes are rebuilt by the app
// on start (Mongoose autoIndex / syncIndexes).
const path = require('path');
const mongoose = require('mongoose');
const { restoreDatabase, readManifest, parseArgs, connect } = require('./backupLib');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || typeof args.dir !== 'string') {
    console.log(
      'Usage: node scripts/restore.js --dir=<backup folder> [--dry-run] [--confirm=<db name>] [--mode=upsert|replace] [--collections=a,b]'
    );
    if (!args.help) process.exitCode = 1;
    return;
  }
  const dir = path.resolve(args.dir);
  const manifest = readManifest(dir);
  const dryRun = !!args['dry-run'];
  const mode = typeof args.mode === 'string' ? args.mode : 'upsert';
  const collections = typeof args.collections === 'string' ? args.collections.split(',').map((s) => s.trim()).filter(Boolean) : null;

  const db = await connect();
  console.log(
    `Backup from ${manifest.createdAt} (db "${manifest.database}", scope ${manifest.scope.type}` +
      `${manifest.scope.pharmacyId ? ` ${manifest.scope.pharmacyId}` : ''}) -> target db "${db.databaseName}", mode ${mode}` +
      `${dryRun ? ' [DRY RUN]' : ''}`
  );

  if (!dryRun && args.confirm !== db.databaseName) {
    console.error(
      `Refusing to restore: pass --confirm=${db.databaseName} to write to this database, or --dry-run to preview.`
    );
    process.exitCode = 1;
    return;
  }

  await restoreDatabase({ db, dir, mode, dryRun, collections, log: (line) => console.log(line) });
  console.log(dryRun ? 'Dry run complete: nothing was written.' : 'Restore complete.');
}

main()
  .catch((err) => {
    console.error(`Restore failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
