const mongoose = require('mongoose');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { audit } = require('../utils/audit');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { expireStalePrescriptions } = require('../services/clinical');

const MAX_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
// Decoded file size limit (the JSON body limit is 1mb; base64 adds ~33%)
const MAX_IMAGE_BYTES = 700 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'application/pdf'];
const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

const str = (v, max = 500) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const assertId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(String(id))) throw new AppError(`Invalid ${label}`, 400);
};
const toDate = (v, label) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${label}`, 400);
  return d;
};
const nonNegInt = (v, label) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new AppError(`Invalid ${label}`, 400);
  return Math.floor(n);
};

// Validates a data URL (image/* except svg, or pdf; max ~700KB decoded).
const parseImage = (image) => {
  const m = DATA_URL_RE.exec(String(image));
  if (!m) throw new AppError('Prescription image must be a base64 data URL', 400);
  const type = m[1].toLowerCase();
  if (!IMAGE_TYPES.includes(type)) throw new AppError('Prescription image must be a PNG, JPEG, GIF, WebP image or a PDF', 400);
  const b64 = m[2];
  const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) throw new AppError('Prescription image is too large (max 700KB)', 400);
  return { image: String(image), imageType: type };
};

// Validates items; medicineIds must belong to this pharmacy (names are filled from the catalog).
const parseItems = async (items, pharmacyId) => {
  if (items === undefined) return [];
  if (!Array.isArray(items)) throw new AppError('Items must be a list', 400);
  if (items.length > 50) throw new AppError('Too many prescription items', 400);
  const ids = items.map((it) => it && it.medicineId).filter(Boolean);
  ids.forEach((id) => assertId(id, 'medicine id'));
  const meds = ids.length
    ? await Medicine.find({ _id: { $in: ids }, pharmacyId }).select('name strength').lean()
    : [];
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  return items.map((it) => {
    const med = it.medicineId ? byId.get(String(it.medicineId)) : null;
    if (it.medicineId && !med) throw new AppError('Medicine not found', 400);
    const name = str(it.name, 200) || (med && med.name) || '';
    if (!name) throw new AppError('Each prescription item needs a medicine or a name', 400);
    return {
      medicineId: med ? med._id : null,
      name,
      dose: str(it.dose, 100),
      frequency: str(it.frequency, 100),
      durationDays: nonNegInt(it.durationDays, 'duration'),
      quantityPrescribed: nonNegInt(it.quantityPrescribed, 'quantity'),
      quantityDispensed: 0,
      refillsAllowed: nonNegInt(it.refillsAllowed, 'refills'),
      refillsUsed: 0,
    };
  });
};

const pickHeader = (body, { partial = false } = {}) => {
  const out = {};
  if (!partial || body.prescriberName !== undefined) {
    out.prescriberName = str(body.prescriberName, 150);
    if (!out.prescriberName) throw new AppError('Prescriber name is required', 400);
  }
  if (body.prescriberLicense !== undefined) out.prescriberLicense = str(body.prescriberLicense, 80);
  if (body.facility !== undefined) out.facility = str(body.facility, 200);
  if (body.externalNumber !== undefined) out.externalNumber = str(body.externalNumber, 80);
  if (body.notes !== undefined) out.notes = str(body.notes, 2000);
  if (!partial || body.issueDate !== undefined) {
    out.issueDate = body.issueDate ? toDate(body.issueDate, 'issue date') : new Date();
  }
  if (body.expiryDate !== undefined) out.expiryDate = body.expiryDate ? toDate(body.expiryDate, 'expiry date') : null;
  if (out.issueDate && out.expiryDate && out.expiryDate < out.issueDate) {
    throw new AppError('Expiry date cannot be before the issue date', 400);
  }
  if (body.image !== undefined) {
    if (!body.image) Object.assign(out, { image: '', imageType: '', imageName: '' });
    else Object.assign(out, parseImage(body.image), { imageName: str(body.imageName, 200) });
  }
  return out;
};

const PATIENT_FIELDS = 'name phone sex dateOfBirth age allergies';

// @route GET /api/prescriptions?patientId&status&search&from&to&page&limit
const getPrescriptions = async (req, res) => {
  await expireStalePrescriptions(req.pharmacyId);
  const query = { pharmacyId: req.pharmacyId };
  if (req.query.patientId) {
    assertId(req.query.patientId, 'patient id');
    query.patientId = req.query.patientId;
  }
  if (req.query.status) query.status = String(req.query.status);
  if (req.query.search) {
    const pattern = escapeRegex(String(req.query.search).trim());
    query.$or = ['number', 'externalNumber', 'prescriberName', 'facility'].map((f) => ({
      [f]: { $regex: pattern, $options: 'i' },
    }));
  }
  if (req.query.from || req.query.to) {
    query.issueDate = {};
    if (req.query.from) query.issueDate.$gte = toDate(req.query.from, 'from date');
    if (req.query.to) query.issueDate.$lte = toDate(req.query.to, 'to date');
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const [prescriptions, total] = await Promise.all([
    Prescription.find(query)
      .sort({ issueDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patientId', 'name phone')
      .lean(),
    Prescription.countDocuments(query),
  ]);
  res.json({
    success: true,
    count: prescriptions.length,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    prescriptions: prescriptions.map((p) => ({ ...p, hasImage: Boolean(p.imageType) })),
  });
};

// @route GET /api/prescriptions/:id  (includes the image)
const getPrescription = async (req, res) => {
  assertId(req.params.id);
  const prescription = await Prescription.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId })
    .select('+image')
    .populate('patientId', PATIENT_FIELDS)
    .lean();
  if (!prescription) throw new AppError('Prescription not found', 404);
  res.json({ success: true, prescription });
};

// @route POST /api/prescriptions
const createPrescription = async (req, res) => {
  const body = req.body || {};
  if (!body.patientId) throw new AppError('Patient is required', 400);
  assertId(body.patientId, 'patient id');
  const patient = await Patient.findOne({ _id: body.patientId, pharmacyId: req.pharmacyId }).select('_id').lean();
  if (!patient) throw new AppError('Patient not found', 404);
  const header = pickHeader(body);
  const items = await parseItems(body.items, req.pharmacyId);

  const session = await mongoose.startSession();
  let prescription;
  try {
    await session.withTransaction(async () => {
      const seq = await nextSequence(req.pharmacyId, 'prescription', { session });
      [prescription] = await Prescription.create(
        [{
          ...header,
          items,
          pharmacyId: req.pharmacyId,
          patientId: patient._id,
          number: formatSequence('RX', seq),
          status: header.expiryDate && header.expiryDate < new Date() ? 'expired' : 'active',
          createdBy: req.user._id,
        }],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
  const out = prescription.toObject();
  delete out.image;
  await audit(req, {
    action: 'prescription.create', entity: 'Prescription', entityId: prescription._id, after: out,
  });
  res.status(201).json({ success: true, prescription: { ...out, hasImage: Boolean(out.imageType) } });
};

// @route PUT /api/prescriptions/:id
// Header fields, image (null/'' removes it), status (active|cancelled|completed) and, while
// nothing has been dispensed, the items.
const updatePrescription = async (req, res) => {
  assertId(req.params.id);
  const body = req.body || {};
  const prescription = await Prescription.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!prescription) throw new AppError('Prescription not found', 404);
  const before = prescription.toObject();

  const header = pickHeader(body, { partial: true });
  const issue = header.issueDate || prescription.issueDate;
  const expiry = header.expiryDate !== undefined ? header.expiryDate : prescription.expiryDate;
  if (expiry && issue && expiry < issue) throw new AppError('Expiry date cannot be before the issue date', 400);
  prescription.set(header);

  if (body.items !== undefined) {
    if (prescription.items.some((it) => it.quantityDispensed > 0)) {
      throw new AppError('Items cannot be changed after dispensing has started', 400);
    }
    prescription.items = await parseItems(body.items, req.pharmacyId);
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!['active', 'cancelled', 'completed'].includes(status)) throw new AppError('Invalid status', 400);
    prescription.status = status;
  }
  if (prescription.status === 'active' && prescription.expiryDate && prescription.expiryDate < new Date()) {
    prescription.status = 'expired';
  }
  await prescription.save();
  const out = prescription.toObject();
  delete out.image;
  await audit(req, {
    action: 'prescription.update', entity: 'Prescription', entityId: prescription._id, before, after: out,
  });
  res.json({ success: true, prescription: { ...out, hasImage: Boolean(out.imageType) } });
};

// @route GET /api/prescriptions/refills-due?days=7
// For active prescriptions with fills left: next due = last dispense + durationDays.
// Lists items due within `days` (including overdue ones). Never-dispensed items are skipped.
const getRefillsDue = async (req, res) => {
  await expireStalePrescriptions(req.pharmacyId);
  const days = Math.min(365, Math.max(0, parseInt(req.query.days, 10) || 7));
  const now = new Date();
  const horizon = new Date(now.getTime() + days * DAY_MS);

  const prescriptions = await Prescription.find({ pharmacyId: req.pharmacyId, status: 'active' })
    .populate('patientId', 'name phone')
    .lean();
  if (prescriptions.length === 0) return res.json({ success: true, days, count: 0, refills: [] });

  // Last dispense per (prescription, medicine) from sales (covers sales that did not update the Rx)
  const rows = await Sale.aggregate([
    {
      $match: {
        pharmacyId: new mongoose.Types.ObjectId(String(req.pharmacyId)),
        prescriptionId: { $in: prescriptions.map((p) => p._id) },
        voided: { $ne: true },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: { rx: '$prescriptionId', med: '$items.medicineId' },
        last: { $max: '$createdAt' },
        qty: { $sum: '$items.quantity' },
      },
    },
  ]);
  const lastSale = new Map(rows.map((r) => [`${r._id.rx}|${r._id.med}`, r]));

  const refills = [];
  prescriptions.forEach((p) => {
    p.items.forEach((it) => {
      if (!it.durationDays) return;
      const saleRow = it.medicineId ? lastSale.get(`${p._id}|${it.medicineId}`) : null;
      const candidates = [it.lastDispensedAt, saleRow && saleRow.last].filter(Boolean).map((d) => new Date(d));
      if (candidates.length === 0) return;
      const last = new Date(Math.max(...candidates.map((d) => d.getTime())));
      const dispensed = Math.max(it.quantityDispensed || 0, (saleRow && saleRow.qty) || 0);
      const fillsLeft = it.quantityPrescribed > 0
        ? it.quantityPrescribed * (1 + it.refillsAllowed) - dispensed > 0
        : it.refillsUsed < it.refillsAllowed;
      if (!fillsLeft) return;
      const nextDue = new Date(last.getTime() + it.durationDays * DAY_MS);
      if (nextDue > horizon) return;
      if (p.expiryDate && nextDue > new Date(p.expiryDate)) return;
      refills.push({
        prescriptionId: p._id,
        prescriptionNumber: p.number,
        externalNumber: p.externalNumber,
        patient: p.patientId,
        itemId: it._id,
        medicineId: it.medicineId,
        name: it.name,
        dose: it.dose,
        frequency: it.frequency,
        durationDays: it.durationDays,
        lastDispensedAt: last,
        nextDue,
        overdue: nextDue < now,
        daysUntilDue: Math.ceil((nextDue.getTime() - now.getTime()) / DAY_MS),
        refillsAllowed: it.refillsAllowed,
        refillsUsed: it.refillsUsed,
      });
    });
  });
  refills.sort((a, b) => a.nextDue - b.nextDue);
  return res.json({ success: true, days, count: refills.length, refills });
};

module.exports = {
  getPrescriptions,
  getPrescription,
  createPrescription,
  updatePrescription,
  getRefillsDue,
  parseImage,
};
