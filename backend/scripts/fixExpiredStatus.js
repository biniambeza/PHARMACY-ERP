#!/usr/bin/env node
// One-off cleanup: batches marked 'expired' although their expiry date is still in the future.
// (Before the fix, an "expired" stock adjustment that emptied a batch set status 'expired'
// regardless of the date, so later returns/voids added quantity to a batch nobody could sell.)
//
//   npm run db:fix-expired-status            # dry run: list affected batches
//   npm run db:fix-expired-status -- --apply # set them to 'active' (quantity > 0) or 'depleted'
//
// Uses MONGO_URI (backend/.env). Safe to run more than once.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');

const run = async ({ apply = false, now = new Date() } = {}) => {
  const filter = { status: 'expired', expiryDate: { $gt: now } };
  const batches = await StockBatch.find(filter).select('_id pharmacyId batchNo quantity expiryDate').lean();
  if (apply && batches.length) {
    await StockBatch.updateMany({ ...filter, quantity: { $gt: 0 } }, { $set: { status: 'active' } });
    await StockBatch.updateMany({ ...filter, quantity: { $lte: 0 } }, { $set: { status: 'depleted' } });
  }
  return batches;
};

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  (async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    await mongoose.connect(process.env.MONGO_URI);
    const batches = await run({ apply });
    for (const b of batches) {
      console.log(`${b.pharmacyId} ${b.batchNo || b._id} qty=${b.quantity} expires=${new Date(b.expiryDate).toISOString().slice(0, 10)}`);
    }
    console.log(`${batches.length} batch(es) wrongly marked expired${apply ? ' - fixed' : ' (dry run, pass --apply to fix)'}`);
    await mongoose.disconnect();
  })().catch(async (err) => {
    console.error(err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { run };
