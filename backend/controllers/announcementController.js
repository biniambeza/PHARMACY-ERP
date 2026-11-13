const mongoose = require('mongoose');
const Announcement = require('../models/Announcement');
const Pharmacy = require('../models/Pharmacy');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');

const SEVERITIES = ['info', 'success', 'warning', 'critical'];
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

const parseDate = (value, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${field}`, 400);
  return d;
};

// Builds a validated update object from the request body. `partial` = PUT/PATCH.
const buildFields = async (body = {}, { partial = false } = {}) => {
  const out = {};
  const str = (v) => (typeof v === 'string' ? v.trim() : v);

  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) throw new AppError('Please provide a title', 400);
    out.title = str(body.title);
  }
  if (!partial || body.message !== undefined) {
    if (typeof body.message !== 'string' || !body.message.trim()) {
      throw new AppError('Please provide a message', 400);
    }
    out.message = str(body.message);
  }
  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity)) throw new AppError('Invalid severity', 400);
    out.severity = body.severity;
  }

  // audience: 'all' or an array of pharmacy ids (or audience 'pharmacies' + pharmacyIds)
  let ids;
  if (Array.isArray(body.audience)) ids = body.audience;
  else if (body.audience === 'pharmacies') ids = Array.isArray(body.pharmacyIds) ? body.pharmacyIds : [];
  if (ids) {
    const clean = [...new Set(ids.map(String))];
    if (!clean.length) throw new AppError('Choose at least one pharmacy for the audience', 400);
    if (!clean.every(isId)) throw new AppError('Invalid pharmacy id in audience', 400);
    const found = await Pharmacy.countDocuments({ _id: { $in: clean } });
    if (found !== clean.length) throw new AppError('Some pharmacies in the audience do not exist', 400);
    out.audience = 'pharmacies';
    out.pharmacyIds = clean.map((id) => new mongoose.Types.ObjectId(id));
  } else if (body.audience === 'all' || (!partial && body.audience === undefined)) {
    out.audience = 'all';
    out.pharmacyIds = [];
  } else if (body.audience !== undefined) {
    throw new AppError("Audience must be 'all' or a list of pharmacies", 400);
  }

  const startsAt = parseDate(body.startsAt, 'start date');
  const endsAt = parseDate(body.endsAt, 'end date');
  if (startsAt !== undefined) out.startsAt = startsAt || new Date();
  if (endsAt !== undefined) out.endsAt = endsAt;
  return out;
};

const assertDates = (doc) => {
  if (doc.endsAt && doc.startsAt && doc.endsAt <= doc.startsAt) {
    throw new AppError('End date must be after the start date', 400);
  }
};

// ----- Tenant ---------------------------------------------------------------

// @desc    Announcements currently active for the current pharmacy
// @route   GET /api/announcements/active
// @access  Any tenant user (admins in support mode)
const getActiveAnnouncements = async (req, res) => {
  const now = new Date();
  const announcements = await Announcement.find({
    startsAt: { $lte: now },
    $and: [
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
      { $or: [{ audience: 'all' }, { audience: 'pharmacies', pharmacyIds: req.pharmacyId }] },
    ],
  })
    .select('title message severity startsAt endsAt updatedAt')
    .sort({ startsAt: -1 })
    .limit(20)
    .lean();
  return res.status(200).json({ success: true, announcements });
};

// ----- Platform admin ---------------------------------------------------------

// @route   GET /api/admin/platform/announcements
const listAnnouncements = async (req, res) => {
  const announcements = await Announcement.find({})
    .populate('pharmacyIds', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  return res.status(200).json({ success: true, announcements });
};

// @route   POST /api/admin/platform/announcements
//          { title, message, severity, audience: 'all' | [pharmacyId], startsAt?, endsAt? }
const createAnnouncement = async (req, res) => {
  const fields = await buildFields(req.body, { partial: false });
  const doc = new Announcement({ ...fields, createdBy: req.user._id });
  assertDates(doc);
  await doc.save();
  await audit(req, { action: 'announcement.create', entity: 'Announcement', entityId: doc._id, after: doc });
  return res.status(201).json({ success: true, announcement: doc });
};

// @route   PUT /api/admin/platform/announcements/:id
const updateAnnouncement = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const doc = await Announcement.findById(req.params.id);
  if (!doc) throw new AppError('Announcement not found', 404);
  const before = doc.toObject();
  const fields = await buildFields(req.body, { partial: true });
  doc.set(fields);
  assertDates(doc);
  await doc.save();
  await audit(req, { action: 'announcement.update', entity: 'Announcement', entityId: doc._id, before, after: doc });
  return res.status(200).json({ success: true, announcement: doc });
};

// @route   DELETE /api/admin/platform/announcements/:id
const deleteAnnouncement = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const doc = await Announcement.findByIdAndDelete(req.params.id);
  if (!doc) throw new AppError('Announcement not found', 404);
  await audit(req, { action: 'announcement.delete', entity: 'Announcement', entityId: doc._id, before: doc });
  return res.status(200).json({ success: true, message: 'Announcement deleted' });
};

module.exports = {
  getActiveAnnouncements,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
