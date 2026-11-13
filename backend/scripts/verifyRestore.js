#!/usr/bin/env node
// Test a backup by restoring it into a scratch database and comparing it.
//
//   npm run backup:verify                                  # latest backup in BACKUP_DIR (or backend/backups)
//   npm run backup:verify -- --dir=backups/backup-20261113-020000
//   npm run backup:verify -- --target=pharmacy_restore_test --drop
//
// Options:
//   --dir <folder>     backup folder (default: newest backup-* folder in BACKUP_DIR / backend/backups)
//   --target <db>      scratch database (default: <live db>_restore_test). Must differ from the live
//                      database and from the backup's source database, and contain "restore" or "test".
//   --sample <n>       _ids sampled per collection (default 20)
//   --force            drop the scratch database first if it already has data
//   --drop             drop the scratch database when finished
// Exit code 0 = PASS, 1 = FAIL / error. Run it monthly (see docs/OPERATIONS.md).
const path = require('path');
const mongoose = require('mongoose');
const { connect } = require('./backupLib');
const { parseCliArgs, verifyRestore, latestBackupDir } = require('./opsLib');
const { backupDir } = require('../jobs/backupJob');

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/verifyRestore.js [--dir <folder>] [--target <db>] [--sample <n>] [--force] [--drop]');
    return;
  }
  const db = await connect();
  const source = db.databaseName;
  const dir = typeof args.dir === 'string' ? path.resolve(args.dir) : latestBackupDir(backupDir());
  if (!dir) throw new Error(`No backup found in ${backupDir()} (pass --dir)`);
  const target = typeof args.target === 'string' ? args.target : `${source}_restore_test`;
  const sampleSize = Math.max(1, Number(args.sample) || 20);

  console.log(`Verifying backup ${dir}\n  -> scratch database "${target}" (live database "${source}" is not touched)`);
  const result = await verifyRestore({
    client: mongoose.connection.getClient(),
    dir,
    target,
    source,
    sampleSize,
    force: !!args.force,
    drop: !!args.drop,
    log: (line) => console.log(line),
  });
  const failed = Object.entries(result.collections).filter(([, c]) => !c.ok).map(([n]) => n);
  console.log('--------------------------------------------------');
  console.log(
    result.ok
      ? `RESTORE TEST PASSED: ${Object.keys(result.collections).length} collections verified.`
      : `RESTORE TEST FAILED: ${failed.join(', ')}`
  );
  if (!args.drop) console.log(`Scratch database "${target}" kept; re-run with --drop (or --force next time) to clean up.`);
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`Restore verification failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
