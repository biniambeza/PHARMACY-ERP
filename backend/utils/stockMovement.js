const StockMovement = require('../models/StockMovement');

/**
 * Record a single stock movement (audit log entry).
 * Pass { session } to write it inside the same transaction as the stock change.
 *
 * data: { pharmacyId, batchId, medicineId, type, quantityChange, balanceAfter,
 *         reason?, userId?, refId?, refModel? }
 */
const recordMovement = async (data, { session } = {}) => {
  const [movement] = await StockMovement.create([data], { session });
  return movement;
};

module.exports = { recordMovement };
