#!/usr/bin/env node
// Database backup (#28). Exports every collection as Canonical EJSON to a timestamped folder.
//
//   npm run backup                                  # all pharmacies -> backend/backups/backup-YYYYMMDD-HHmmss/
//   npm run backup -- --pharmacy=<pharmacyId>       # one pharmacy only
//   npm run backup -- --gzip --out=/path/to/backups # gzip files, custom parent folder
//
// Schedule it with cron / Task Scheduler (e.g. nightly) and copy the folder off the server.
// For Atlas clusters, Atlas cloud backups are still recommended; this is a portable extra copy.
// Owners' self-service "download my data" lives in the Insights export (/api/export).
const mongoose = require('mongoose');
const { exportDatabase, parseArgs, connect } = require('./backupLib');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/backup.js [--pharmacy=<id>] [--out=<dir>] [--gzip]');
    return;
  }
  const db = await connect();
  console.log(`Backing up database "${db.databaseName}"${args.pharmacy ? ` (pharmacy ${args.pharmacy})` : ''}...`);
  const { dir, manifest } = await exportDatabase({
    db,
    outDir: typeof args.out === 'string' ? args.out : undefined,
    pharmacyId: typeof args.pharmacy === 'string' ? args.pharmacy : undefined,
    gzip: !!args.gzip,
    log: (line) => console.log(line),
  });
  const total = Object.values(manifest.collections).reduce((s, c) => s + c.count, 0);
  console.log(`Done: ${total} documents in ${Object.keys(manifest.collections).length} collections -> ${dir}`);
}

main()
  .catch((err) => {
    console.error(`Backup failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
