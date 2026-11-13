// Lease lock + run bookkeeping for background jobs (one document per job name).
//
// A job instance "owns" the job while lockedUntil is in the future. Locks are
// acquired atomically (see jobs/lock.js), so with several backend instances
// (or a restart overlapping with the old process) a job only runs once.
// lastSuccessAt drives the catch-up of runs missed while the service slept.
const mongoose = require('mongoose');

const jobLockSchema = new mongoose.Schema(
  {
    _id: { type: String }, // job name, e.g. 'daily-checks'
    lockedUntil: { type: Date, default: null },
    owner: { type: String, default: null },
    lastRunAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.JobLock || mongoose.model('JobLock', jobLockSchema);
