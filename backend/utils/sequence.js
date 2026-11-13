const Counter = require('../models/Counter');

/**
 * Atomically get the next sequence value for a pharmacy-scoped counter.
 * Pass { session } to participate in a transaction.
 * Returns e.g. formatSequence('INV', 123) -> 'INV-2026-000123'.
 */
const nextSequence = async (pharmacyId, name, { session } = {}) => {
  const counter = await Counter.findOneAndUpdate(
    { pharmacyId, name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, session }
  );
  return counter.seq;
};

const formatSequence = (prefix, seq, date = new Date()) =>
  `${prefix}-${date.getFullYear()}-${String(seq).padStart(6, '0')}`;

module.exports = { nextSequence, formatSequence };
