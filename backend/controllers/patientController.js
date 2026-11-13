const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { audit } = require('../utils/audit');

const MAX_LIMIT = 100;
const SEXES = ['male', 'female', 'other', 'unknown'];
const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe', 'unknown'];

const str = (v, max = 500) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

const assertId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(String(id))) throw new AppError(`Invalid ${label}`, 400);
};

// Builds the patient fields from the request body (only whitelisted fields).
const pickPatient = (body, { partial = false } = {}) => {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = str(body.name, 150);
    if (!out.name) throw new AppError('Patient name is required', 400);
  }
  if (body.dateOfBirth !== undefined) {
    if (!body.dateOfBirth) out.dateOfBirth = null;
    else {
      const d = new Date(body.dateOfBirth);
      if (Number.isNaN(d.getTime()) || d > new Date()) throw new AppError('Invalid date of birth', 400);
      out.dateOfBirth = d;
    }
  }
  if (body.age !== undefined) {
    if (body.age === null || body.age === '') out.age = null;
    else {
      const age = Number(body.age);
      if (!Number.isFinite(age) || age < 0 || age > 150) throw new AppError('Invalid age', 400);
      out.age = Math.floor(age);
    }
  }
  if (body.sex !== undefined) {
    const sex = str(body.sex).toLowerCase() || 'unknown';
    if (!SEXES.includes(sex)) throw new AppError('Invalid sex', 400);
    out.sex = sex;
  }
  if (body.phone !== undefined) out.phone = str(body.phone, 40);
  if (body.notes !== undefined) out.notes = str(body.notes, 2000);
  if (body.conditions !== undefined) {
    const list = Array.isArray(body.conditions) ? body.conditions : String(body.conditions || '').split(',');
    out.conditions = [...new Set(list.map((c) => str(c, 120)).filter(Boolean))].slice(0, 50);
  }
  if (body.allergies !== undefined) {
    if (!Array.isArray(body.allergies)) throw new AppError('Allergies must be a list', 400);
    out.allergies = body.allergies.slice(0, 50).map((a) => {
      const substance = str(a && a.substance, 120);
      if (!substance) throw new AppError('Each allergy needs a substance', 400);
      const severity = str(a.severity).toLowerCase() || 'unknown';
      if (!ALLERGY_SEVERITIES.includes(severity)) throw new AppError('Invalid allergy severity', 400);
      return { substance, reaction: str(a.reaction, 300), severity };
    });
  }
  if (body.customerId !== undefined) {
    if (!body.customerId) out.customerId = null;
    else {
      assertId(body.customerId, 'customer id');
      out.customerId = body.customerId;
    }
  }
  return out;
};

// @route GET /api/patients?search=&page=&limit=&includeArchived=
const getPatients = async (req, res) => {
  const query = { pharmacyId: req.pharmacyId };
  if (String(req.query.includeArchived) !== 'true') query.isArchived = { $ne: true };
  if (req.query.search) {
    const pattern = escapeRegex(String(req.query.search).trim());
    query.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { phone: { $regex: pattern, $options: 'i' } },
    ];
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const [patients, total] = await Promise.all([
    Patient.find(query).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Patient.countDocuments(query),
  ]);
  res.json({ success: true, count: patients.length, total, page, limit, pages: Math.ceil(total / limit), patients });
};

// @route GET /api/patients/:id
const getPatient = async (req, res) => {
  assertId(req.params.id);
  const patient = await Patient.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId }).lean();
  if (!patient) throw new AppError('Patient not found', 404);
  res.json({ success: true, patient });
};

// @route POST /api/patients
const createPatient = async (req, res) => {
  const data = pickPatient(req.body || {});
  const patient = await Patient.create({ ...data, pharmacyId: req.pharmacyId, createdBy: req.user._id });
  await audit(req, { action: 'patient.create', entity: 'Patient', entityId: patient._id, after: patient });
  res.status(201).json({ success: true, patient });
};

// @route PUT /api/patients/:id
const updatePatient = async (req, res) => {
  assertId(req.params.id);
  const patient = await Patient.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!patient) throw new AppError('Patient not found', 404);
  const before = patient.toObject();
  const data = pickPatient(req.body || {}, { partial: true });
  if (req.body && req.body.isArchived !== undefined) data.isArchived = Boolean(req.body.isArchived);
  patient.set(data);
  await patient.save();
  await audit(req, { action: 'patient.update', entity: 'Patient', entityId: patient._id, before, after: patient });
  res.json({ success: true, patient });
};

// @route DELETE /api/patients/:id  (archives; records are kept for history)
const archivePatient = async (req, res) => {
  assertId(req.params.id);
  const patient = await Patient.findOneAndUpdate(
    { _id: req.params.id, pharmacyId: req.pharmacyId },
    { $set: { isArchived: true } },
    { returnDocument: 'after' }
  );
  if (!patient) throw new AppError('Patient not found', 404);
  await audit(req, { action: 'patient.archive', entity: 'Patient', entityId: patient._id });
  res.json({ success: true, archived: true, patient });
};

// @route GET /api/patients/:id/history
// Medication history from sales linked to the patient, plus prescriptions.
const getPatientHistory = async (req, res) => {
  assertId(req.params.id);
  const patient = await Patient.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId }).lean();
  if (!patient) throw new AppError('Patient not found', 404);

  const [sales, prescriptions] = await Promise.all([
    Sale.find({ pharmacyId: req.pharmacyId, patientId: patient._id })
      .sort({ createdAt: -1 })
      .limit(500)
      .select('invoiceNumber createdAt items voided returnStatus prescriptionId prescription grandTotal')
      .populate('prescriptionId', 'number externalNumber')
      .lean(),
    Prescription.find({ pharmacyId: req.pharmacyId, patientId: patient._id })
      .sort({ issueDate: -1 })
      .lean(),
  ]);

  const medications = [];
  sales.forEach((s) => {
    (s.items || []).forEach((it) => {
      medications.push({
        date: s.createdAt,
        saleId: s._id,
        invoiceNumber: s.invoiceNumber,
        medicineId: it.medicineId,
        name: it.name,
        quantity: it.quantity,
        batchNo: it.batchNo,
        voided: Boolean(s.voided),
        returnStatus: s.returnStatus,
        prescriptionId: s.prescriptionId ? s.prescriptionId._id : null,
        prescriptionNumber: s.prescriptionId
          ? s.prescriptionId.externalNumber || s.prescriptionId.number
          : (s.prescription && s.prescription.number) || '',
      });
    });
  });

  res.json({ success: true, patient, medications, prescriptions });
};

module.exports = { getPatients, getPatient, createPatient, updatePatient, archivePatient, getPatientHistory };
