const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const generateToken = require('../utils/generateToken');
const { changeUserPassword } = require('./authController');
const { audit } = require('../utils/audit');

// @desc    Active pharmacy details incl. settings (tax, currency, receipt...).
//          Readable by every staff member: the POS needs tax/currency settings.
// @route   GET /api/pharmacy/my-pharmacy
// @access  Private (any staff member)
const getMyPharmacy = async (req, res) => {
  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  if (!pharmacy) {
    throw new AppError('Pharmacy not found', 404);
  }

  return res.status(200).json({
    success: true,
    pharmacyId: req.pharmacyId,
    pharmacy,
  });
};

const RECEIPT_WIDTHS = ['58mm', '80mm', 'A4'];
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const asBool = (v, field) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new AppError(`${field} must be true or false`, 400);
};

const asNumber = (v, field, min, max) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw new AppError(`${field} must be a number between ${min} and ${max}`, 400);
  }
  return n;
};

const asString = (v, field, max) => {
  if (v === null) return '';
  if (typeof v !== 'string') throw new AppError(`${field} must be text`, 400);
  const s = v.trim();
  if (s.length > max) throw new AppError(`${field} must be at most ${max} characters`, 400);
  return s;
};

// Validates the `settings` patch and returns a flat { 'settings.x.y': value } $set map.
const buildSettingsUpdate = (settings) => {
  if (!isPlainObject(settings)) throw new AppError('settings must be an object', 400);
  const set = {};

  if (settings.tax !== undefined) {
    const tax = settings.tax;
    if (!isPlainObject(tax)) throw new AppError('settings.tax must be an object', 400);
    if (tax.enabled !== undefined) set['settings.tax.enabled'] = asBool(tax.enabled, 'Tax enabled');
    if (tax.name !== undefined) {
      const name = asString(tax.name, 'Tax name', 30);
      if (!name) throw new AppError('Tax name is required', 400);
      set['settings.tax.name'] = name;
    }
    if (tax.rate !== undefined) set['settings.tax.rate'] = asNumber(tax.rate, 'Tax rate', 0, 100);
    if (tax.inclusive !== undefined) set['settings.tax.inclusive'] = asBool(tax.inclusive, 'Tax inclusive');
    if (tax.registrationNo !== undefined) {
      set['settings.tax.registrationNo'] = asString(tax.registrationNo, 'Tax registration number', 50);
    }
  }

  if (settings.currency !== undefined) {
    const currency = asString(settings.currency, 'Currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new AppError('Currency must be a 3-letter ISO code (e.g. ETB)', 400);
    set['settings.currency'] = currency;
  }

  if (settings.locale !== undefined) {
    const locale = asString(settings.locale, 'Locale', 10);
    if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(locale)) throw new AppError('Locale must look like "en" or "am-ET"', 400);
    set['settings.locale'] = locale;
  }

  if (settings.receiptFooter !== undefined) {
    set['settings.receiptFooter'] = asString(settings.receiptFooter, 'Receipt footer', 500);
  }

  if (settings.receiptWidth !== undefined) {
    if (!RECEIPT_WIDTHS.includes(settings.receiptWidth)) {
      throw new AppError(`Receipt width must be one of ${RECEIPT_WIDTHS.join(', ')}`, 400);
    }
    set['settings.receiptWidth'] = settings.receiptWidth;
  }

  if (settings.expiryAlertDays !== undefined) {
    if (!Array.isArray(settings.expiryAlertDays) || settings.expiryAlertDays.length > 10) {
      throw new AppError('Expiry alert days must be a list of up to 10 numbers', 400);
    }
    const days = settings.expiryAlertDays.map((d) => {
      const n = asNumber(d, 'Expiry alert day', 1, 730);
      if (!Number.isInteger(n)) throw new AppError('Expiry alert days must be whole numbers', 400);
      return n;
    });
    set['settings.expiryAlertDays'] = [...new Set(days)].sort((a, b) => b - a);
  }

  if (settings.notify !== undefined) {
    if (!isPlainObject(settings.notify)) throw new AppError('settings.notify must be an object', 400);
    ['email', 'sms', 'dailySummary'].forEach((k) => {
      if (settings.notify[k] !== undefined) set[`settings.notify.${k}`] = asBool(settings.notify[k], `Notify ${k}`);
    });
  }

  if (settings.maxDiscountPercent !== undefined) {
    set['settings.maxDiscountPercent'] = asNumber(settings.maxDiscountPercent, 'Max discount %', 0, 100);
  }

  return set;
};

const auditSnapshot = (p) => {
  const o = typeof p.toObject === 'function' ? p.toObject() : p;
  return { name: o.name, phone: o.phone, address: o.address, settings: o.settings };
};

// @desc    Update pharmacy details (phone, address) and settings (tax, currency, receipts...)
// @route   PUT /api/pharmacy/my-pharmacy
// @access  Private (settings:manage, i.e. owner)
const updateMyPharmacy = async (req, res) => {
  const { phone, address, settings } = req.body || {};

  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  if (!pharmacy) {
    throw new AppError('Pharmacy not found', 404);
  }

  const update = {};
  if (phone !== undefined) {
    const v = asString(phone, 'Phone', 30);
    if (!v) throw new AppError('Phone cannot be empty', 400);
    update.phone = v;
  }
  if (address !== undefined) {
    const v = asString(address, 'Address', 300);
    if (!v) throw new AppError('Address cannot be empty', 400);
    update.address = v;
  }
  if (settings !== undefined) Object.assign(update, buildSettingsUpdate(settings));

  if (Object.keys(update).length === 0) {
    return res.status(200).json({ success: true, message: 'Nothing to update', pharmacy });
  }

  const before = auditSnapshot(pharmacy);
  const updated = await Pharmacy.findOneAndUpdate(
    { _id: pharmacy._id },
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  );

  await audit(req, {
    action: settings !== undefined ? 'pharmacy.settings_update' : 'pharmacy.update',
    entity: 'Pharmacy',
    entityId: pharmacy._id,
    before,
    after: auditSnapshot(updated),
    meta: { fields: Object.keys(update) },
  });

  return res.status(200).json({
    success: true,
    message: 'Pharmacy settings updated successfully',
    pharmacy: updated,
  });
};

// @desc    Update pharmacist personal profile & password
// @route   PUT /api/pharmacy/profile
// @access  Private (Pharmacist only)
// When the password changes, all previous tokens are revoked and a new token
// is returned in the response.
const updatePharmacistProfile = async (req, res) => {
  const { name, currentPassword, newPassword } = req.body || {};

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError('User account not found', 404);
  }

  if (typeof name === 'string' && name.trim()) user.name = name.trim();

  const passwordChanged = Boolean(newPassword);
  if (passwordChanged) {
    await changeUserPassword(user, currentPassword, newPassword);
  }

  await user.save();

  return res.status(200).json({
    success: true,
    message: passwordChanged ? 'Profile and password updated successfully' : 'Profile updated successfully',
    ...(passwordChanged && { token: generateToken(user._id, user.role, user.tokenVersion) }),
    user: {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

module.exports = {
  getMyPharmacy,
  updateMyPharmacy,
  updatePharmacistProfile,
};
