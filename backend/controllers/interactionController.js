const mongoose = require('mongoose');
const InteractionRule = require('../models/InteractionRule');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { checkSaleClinical, getRules, loadBuiltIn, normalize } = require('../services/clinical');

const SEVERITIES = ['minor', 'moderate', 'major', 'contraindicated'];

const pickRule = (body) => {
  const a = normalize(body.substanceA);
  const b = normalize(body.substanceB);
  if (!a || !b) throw new AppError('Both substances are required', 400);
  if (a === b) throw new AppError('Substances must be different', 400);
  if (a.length > 120 || b.length > 120) throw new AppError('Substance name too long', 400);
  const severity = String(body.severity || 'moderate').toLowerCase();
  if (!SEVERITIES.includes(severity)) throw new AppError('Invalid severity', 400);
  const [substanceA, substanceB] = [a, b].sort();
  return { substanceA, substanceB, severity, description: String(body.description || '').trim().slice(0, 1000) };
};

// @route GET /api/interactions/rules -> { notice, global (read-only), custom }
const listRules = async (req, res) => {
  const { global, custom } = await getRules(req.pharmacyId);
  res.json({ success: true, notice: loadBuiltIn().notice, global, custom });
};

// @route POST /api/interactions/rules
const createRule = async (req, res) => {
  const data = pickRule(req.body || {});
  const rule = await InteractionRule.create({ ...data, pharmacyId: req.pharmacyId, createdBy: req.user._id });
  await audit(req, { action: 'interaction_rule.create', entity: 'InteractionRule', entityId: rule._id, after: rule });
  res.status(201).json({ success: true, rule });
};

// @route PUT /api/interactions/rules/:id (pharmacy rules only)
const updateRule = async (req, res) => {
  if (!mongoose.isValidObjectId(String(req.params.id))) throw new AppError('Invalid id', 400);
  const rule = await InteractionRule.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!rule) throw new AppError('Rule not found (global rules are read-only)', 404);
  const before = rule.toObject();
  rule.set(pickRule({ ...before, ...(req.body || {}) }));
  await rule.save();
  await audit(req, { action: 'interaction_rule.update', entity: 'InteractionRule', entityId: rule._id, before, after: rule });
  res.json({ success: true, rule });
};

// @route DELETE /api/interactions/rules/:id (pharmacy rules only)
const deleteRule = async (req, res) => {
  if (!mongoose.isValidObjectId(String(req.params.id))) throw new AppError('Invalid id', 400);
  const rule = await InteractionRule.findOneAndDelete({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!rule) throw new AppError('Rule not found (global rules are read-only)', 404);
  await audit(req, { action: 'interaction_rule.delete', entity: 'InteractionRule', entityId: rule._id, before: rule });
  res.json({ success: true });
};

// @route POST /api/interactions/check { patientId?, medicineIds: [] }
const checkInteractions = async (req, res) => {
  const { patientId, medicineIds } = req.body || {};
  if (medicineIds !== undefined && !Array.isArray(medicineIds)) throw new AppError('medicineIds must be a list', 400);
  if ((medicineIds || []).length > 200) throw new AppError('Too many medicines', 400);
  const result = await checkSaleClinical({ pharmacyId: req.pharmacyId, patientId: patientId || null, medicineIds: medicineIds || [] });
  res.json({ success: true, ...result });
};

module.exports = { listRules, createRule, updateRule, deleteRule, checkInteractions };
