// First-run onboarding checklist (/api/onboarding). Every step is computed from data.
const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const Supplier = require('../models/Supplier');
const Shift = require('../models/Shift');
const Sale = require('../models/Sale');
const AuditLog = require('../models/AuditLog');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { can } = require('../config/permissions');

const has = (v) => typeof v === 'string' && v.trim().length > 0;
const exists = async (model, filter) => Boolean(await model.exists(filter));

const buildChecklist = async (req) => {
  const pharmacy = await Pharmacy.findById(req.pharmacyId).lean();
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);
  const pharmacyId = pharmacy._id;
  const settings = pharmacy.settings || {};
  const requireShift = settings.requireShift === true;

  const [medicine, stock, supplier, staff, shift, sale, settingsSaved, user] = await Promise.all([
    exists(Medicine, { pharmacyId, isArchived: { $ne: true } }),
    exists(StockBatch, { pharmacyId }),
    exists(Supplier, { pharmacyId, isArchived: { $ne: true } }),
    exists(User, { 'memberships.pharmacyId': pharmacyId, _id: { $ne: req.user._id } }),
    requireShift ? exists(Shift, { pharmacyId }) : Promise.resolve(false),
    exists(Sale, { pharmacyId }),
    exists(AuditLog, { pharmacyId, action: 'pharmacy.settings_update' }),
    // 2FA is added by another module: read the raw field and tolerate its absence.
    User.findById(req.user._id).lean(),
  ]);

  const contactDone = has(pharmacy.address) && has(pharmacy.phone) && has(pharmacy.licenseNo);
  const steps = [
    {
      key: 'business',
      done: contactDone && has(pharmacy.tin),
      optional: false,
      // The TIN lives in the e-invoicing settings
      link: contactDone ? '/pharmacy/einvoice' : '/pharmacy/settings',
    },
    {
      key: 'currencyTax',
      done: has(settings.currency) && (Boolean(settings.tax?.enabled) || settingsSaved),
      optional: false,
      link: '/pharmacy/settings',
    },
    { key: 'medicines', done: medicine, optional: false, link: '/pharmacy/import', altLink: '/pharmacy/medicines' },
    { key: 'stock', done: stock, optional: false, link: '/pharmacy/stock' },
    { key: 'supplier', done: supplier, optional: false, link: '/pharmacy/suppliers' },
    { key: 'staff', done: staff, optional: true, link: '/pharmacy/staff' },
    ...(requireShift ? [{ key: 'shift', done: shift, optional: true, link: '/pharmacy/shifts' }] : []),
    { key: 'sale', done: sale, optional: false, link: '/pharmacy/pos' },
    { key: 'twoFactor', done: Boolean(user?.twoFactor?.enabled), optional: true, link: '/pharmacy/settings' },
  ];

  const required = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  const requiredDone = required.filter((s) => s.done).length;
  const dismissedAt = pharmacy.onboarding?.dismissedAt || null;
  const complete = requiredDone === required.length;
  const isOwner = req.user.role === 'pharmacist' && can(req.membershipRole, 'settings:manage');

  return {
    steps,
    total: steps.length,
    done: doneCount,
    requiredTotal: required.length,
    requiredDone,
    percent: Math.round((doneCount / steps.length) * 100),
    complete,
    dismissed: Boolean(dismissedAt),
    dismissedAt,
    canDismiss: isOwner,
    // The dashboard card is shown to owners until complete or dismissed
    show: isOwner && !complete && !dismissedAt,
  };
};

// @route GET /api/onboarding/status   (any staff member)
const getStatus = async (req, res) => {
  res.status(200).json({ success: true, onboarding: await buildChecklist(req) });
};

// @route POST /api/onboarding/dismiss   (settings:manage)
const dismiss = async (req, res) => {
  await Pharmacy.updateOne({ _id: req.pharmacyId }, { $set: { 'onboarding.dismissedAt': new Date() } });
  await audit(req, { action: 'onboarding.dismiss', entity: 'Pharmacy', entityId: req.pharmacyId });
  res.status(200).json({ success: true, onboarding: await buildChecklist(req) });
};

// @route DELETE /api/onboarding/dismiss   (settings:manage) - show the checklist again
const restore = async (req, res) => {
  await Pharmacy.updateOne({ _id: req.pharmacyId }, { $set: { 'onboarding.dismissedAt': null } });
  res.status(200).json({ success: true, onboarding: await buildChecklist(req) });
};

module.exports = { getStatus, dismiss, restore, buildChecklist };
