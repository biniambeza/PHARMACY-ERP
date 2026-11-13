// Digital receipts: send a sale receipt by SMS / email, or fetch it as plain text.
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Pharmacy = require('../models/Pharmacy');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
// Accessed as notify.sendSms / notify.sendEmail (not destructured) so tests can stub them.
const notify = require('../services/notify');
const receipts = require('../services/receipts');

const loadSale = async (req) => {
  const { saleId } = req.params;
  if (!mongoose.isValidObjectId(saleId)) throw new AppError('Sale not found', 404);
  const sale = await Sale.findOne({ _id: saleId, pharmacyId: req.pharmacyId })
    .populate('customerId', 'name phone email')
    .lean();
  if (!sale) throw new AppError('Sale not found', 404);
  return sale;
};

const loadPharmacy = async (req) => {
  if (req.pharmacy && req.pharmacy.name && req.pharmacy.settings) return req.pharmacy;
  return Pharmacy.findById(req.pharmacyId).select('name address phone licenseNo tin settings').lean();
};

// GET /api/receipts/:saleId/text -> { text }
const getReceiptText = async (req, res) => {
  const sale = await loadSale(req);
  const pharmacy = await loadPharmacy(req);
  res.json({ success: true, text: receipts.buildReceiptText({ sale, pharmacy }) });
};

// POST /api/receipts/:saleId/send { channel: 'sms'|'email', to }
const sendReceipt = async (req, res) => {
  const { channel, to } = req.body || {};
  if (channel !== 'sms' && channel !== 'email') throw new AppError("channel must be 'sms' or 'email'", 400);
  const recipient = channel === 'sms' ? receipts.normalizePhone(to) : receipts.normalizeEmail(to);
  if (!recipient) {
    throw new AppError(channel === 'sms' ? 'Invalid phone number' : 'Invalid email address', 400);
  }

  const sale = await loadSale(req);
  const pharmacy = await loadPharmacy(req);

  const rate = receipts.checkSendRate(`${req.pharmacyId}:${sale._id}`);
  if (!rate.allowed) {
    res.set('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
    throw new AppError('Too many receipt sends for this sale. Try again later.', 429);
  }

  let result;
  if (channel === 'sms') {
    const text = receipts.buildReceiptText({ sale, pharmacy, compact: true });
    result = await notify.sendSms({ to: recipient, text });
  } else {
    const text = receipts.buildReceiptText({ sale, pharmacy });
    result = await notify.sendEmail({
      to: recipient,
      subject: `Receipt ${sale.invoiceNumber} - ${pharmacy?.name || 'Pharmacy'}`,
      text,
    });
  }
  const sent = Boolean(result && result.sent);
  // notify.* only log (skipped) when SMTP / the SMS provider isn't configured
  const logged = !sent && Boolean(result && result.skipped);

  await audit(req, {
    action: 'receipt.send',
    entity: 'Sale',
    entityId: sale._id,
    meta: { channel, to: recipient, invoiceNumber: sale.invoiceNumber, sent, logged },
  });

  if (!sent && !logged) throw new AppError('Could not send the receipt. Please try again.', 502);
  res.json({ success: true, sent, logged, channel, to: recipient });
};

module.exports = { getReceiptText, sendReceipt };
