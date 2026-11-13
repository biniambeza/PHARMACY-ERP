const mongoose = require('mongoose');

// One document per receipt send (SMS / email), used by services/receipts.checkSendRate
// as a sliding-window rate limit shared by every server instance.
// `key` is "<pharmacyId>:<saleId>". Documents expire via the TTL index after the
// longest window in use (TTL_SECONDS); counting always filters by createdAt as well,
// because MongoDB's TTL monitor only runs about once a minute.

const TTL_SECONDS = 60 * 60; // keep in sync with receipts.SEND_WINDOW_MS

const receiptSendLogSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, maxlength: 200 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

receiptSendLogSchema.index({ key: 1, createdAt: 1 });
receiptSendLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_SECONDS, name: 'ttl_createdAt' });

const ReceiptSendLog = mongoose.model('ReceiptSendLog', receiptSendLogSchema);
ReceiptSendLog.TTL_SECONDS = TTL_SECONDS;

module.exports = ReceiptSendLog;
