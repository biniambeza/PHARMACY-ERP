// Insurance / credit-scheme billing: schemes, members, POS preview, claims, receivables.
// Owner: Insurance agent. Business rules live in services/insurance.js.
const mongoose = require('mongoose');
const InsuranceScheme = require('../models/InsuranceScheme');
const InsuranceMember = require('../models/InsuranceMember');
const InsuranceClaim = require('../models/InsuranceClaim');
const Medicine = require('../models/Medicine');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { audit } = require('../utils/audit');
const svc = require('../services/insurance');

const { round2 } = svc;
const MAX_LIST = 500;
const str = (v, max = 200) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

const assertId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`Invalid ${label}`, 400);
};

const optionalId = (v, label) => {
  if (v === undefined || v === null || v === '') return null;
  assertId(v, label);
  return new mongoose.Types.ObjectId(String(v));
};

const optionalDate = (v, label) => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${label}`, 400);
  return d;
};

const numberIn = (v, label, { min = 0, max = Infinity } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new AppError(`${label} must be a number between ${min} and ${max === Infinity ? 'any' : max}`, 400);
  }
  return round2(n);
};

const withTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const isDuplicateKey = (err) => err && err.code === 11000;

// ---------- Schemes ----------

// Builds the scheme fields from the body (partial for updates).
const schemeFields = async (req, body, { partial = false } = {}) => {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('name')) {
    out.name = str(body.name);
    if (!out.name) throw new AppError('Scheme name is required', 400);
  }
  if (has('code')) out.code = str(body.code, 50);
  if (has('type')) {
    if (!InsuranceScheme.SCHEME_TYPES.includes(body.type)) throw new AppError('Invalid scheme type', 400);
    out.type = body.type;
  }
  if (has('payer') && body.payer && typeof body.payer === 'object') {
    out.payer = {
      name: str(body.payer.name),
      contactPerson: str(body.payer.contactPerson),
      phone: str(body.payer.phone, 50),
      email: str(body.payer.email),
      address: str(body.payer.address, 500),
    };
  }
  if (has('coveragePercent')) out.coveragePercent = numberIn(body.coveragePercent, 'Coverage percent', { max: 100 });
  if (has('copayType')) {
    if (!InsuranceScheme.COPAY_TYPES.includes(body.copayType)) throw new AppError('Invalid copay type', 400);
    out.copayType = body.copayType;
  }
  if (has('copayValue')) out.copayValue = numberIn(body.copayValue || 0, 'Copay value');
  const copayType = out.copayType || body.copayType;
  if (copayType === 'percent' && out.copayValue > 100) throw new AppError('Copay percent cannot exceed 100', 400);
  if (has('maxPerSale')) out.maxPerSale = numberIn(body.maxPerSale || 0, 'Maximum per sale');
  if (has('claimCycle')) {
    if (!InsuranceScheme.CLAIM_CYCLES.includes(body.claimCycle)) throw new AppError('Invalid claim cycle', 400);
    out.claimCycle = body.claimCycle;
  }
  if (has('notes')) out.notes = str(body.notes, 1000);
  if (has('active')) out.active = body.active === true || body.active === 'true';
  if (has('autoClaim')) out.autoClaim = body.autoClaim === true || body.autoClaim === 'true';
  if (has('excludedCategories')) {
    const list = Array.isArray(body.excludedCategories)
      ? body.excludedCategories
      : String(body.excludedCategories || '').split(',');
    out.excludedCategories = [...new Set(list.map((c) => str(c, 100)).filter(Boolean))].slice(0, 100);
  }
  if (has('excludedMedicineIds')) {
    const ids = Array.isArray(body.excludedMedicineIds) ? body.excludedMedicineIds : [];
    if (ids.length > 1000) throw new AppError('Too many excluded medicines', 400);
    ids.forEach((id) => assertId(id && id._id ? id._id : id, 'medicine id'));
    const unique = [...new Set(ids.map((id) => String(id && id._id ? id._id : id)))];
    const count = await Medicine.countDocuments({ _id: { $in: unique }, pharmacyId: req.pharmacyId });
    if (count !== unique.length) throw new AppError('Excluded medicine not found in your catalog', 400);
    out.excludedMedicineIds = unique.map((id) => new mongoose.Types.ObjectId(id));
  }
  return out;
};

// @route GET /api/insurance/schemes   (?active=true|false, ?search)
const getSchemes = async (req, res) => {
  const query = { pharmacyId: req.pharmacyId };
  if (req.query.active === 'true') query.active = true;
  if (req.query.active === 'false') query.active = false;
  if (req.query.search) query.name = { $regex: escapeRegex(str(req.query.search)), $options: 'i' };
  const schemes = await InsuranceScheme.find(query)
    .sort({ name: 1 })
    .limit(MAX_LIST)
    .populate('excludedMedicineIds', 'name category')
    .lean();
  const counts = await InsuranceMember.aggregate([
    { $match: { pharmacyId: req.pharmacyId } },
    { $group: { _id: '$schemeId', members: { $sum: 1 } } },
  ]);
  const byScheme = new Map(counts.map((c) => [String(c._id), c.members]));
  res.json({ success: true, schemes: schemes.map((s) => ({ ...s, memberCount: byScheme.get(String(s._id)) || 0 })) });
};

const findScheme = async (req) => {
  assertId(req.params.id, 'scheme id');
  const scheme = await InsuranceScheme.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!scheme) throw new AppError('Insurance scheme not found', 404);
  return scheme;
};

// @route GET /api/insurance/schemes/:id
const getScheme = async (req, res) => {
  const scheme = await findScheme(req);
  await scheme.populate('excludedMedicineIds', 'name category');
  res.json({ success: true, scheme });
};

// @route POST /api/insurance/schemes
const createScheme = async (req, res) => {
  const fields = await schemeFields(req, req.body || {});
  try {
    const scheme = await InsuranceScheme.create({ ...fields, pharmacyId: req.pharmacyId });
    await audit(req, { action: 'insurance.scheme_create', entity: 'InsuranceScheme', entityId: scheme._id, after: scheme });
    res.status(201).json({ success: true, scheme });
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError('A scheme with this name already exists', 409);
    throw err;
  }
};

// @route PUT /api/insurance/schemes/:id
const updateScheme = async (req, res) => {
  const scheme = await findScheme(req);
  const before = scheme.toObject();
  const fields = await schemeFields(req, req.body || {}, { partial: true });
  if (fields.copayType === undefined && fields.copayValue > 100 && scheme.copayType === 'percent') {
    throw new AppError('Copay percent cannot exceed 100', 400);
  }
  scheme.set(fields);
  try {
    await scheme.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError('A scheme with this name already exists', 409);
    throw err;
  }
  await audit(req, { action: 'insurance.scheme_update', entity: 'InsuranceScheme', entityId: scheme._id, before, after: scheme });
  res.json({ success: true, scheme });
};

// @route DELETE /api/insurance/schemes/:id   (only when unused; otherwise deactivate it)
const deleteScheme = async (req, res) => {
  const scheme = await findScheme(req);
  const [members, sales, claims] = await Promise.all([
    InsuranceMember.countDocuments({ pharmacyId: req.pharmacyId, schemeId: scheme._id }),
    Sale.countDocuments({ pharmacyId: req.pharmacyId, 'insurance.schemeId': scheme._id }),
    InsuranceClaim.countDocuments({ pharmacyId: req.pharmacyId, schemeId: scheme._id }),
  ]);
  if (members + sales + claims > 0) {
    throw new AppError('This scheme has members, sales or claims. Deactivate it instead.', 400);
  }
  await InsuranceScheme.deleteOne({ _id: scheme._id, pharmacyId: req.pharmacyId });
  await audit(req, { action: 'insurance.scheme_delete', entity: 'InsuranceScheme', entityId: scheme._id, before: scheme });
  res.json({ success: true });
};

// ---------- Members ----------

const memberFields = async (req, body, { partial = false } = {}) => {
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (!partial || has('schemeId')) {
    const schemeId = optionalId(body.schemeId, 'scheme id');
    if (!schemeId) throw new AppError('Scheme is required', 400);
    const exists = await InsuranceScheme.exists({ _id: schemeId, pharmacyId: req.pharmacyId });
    if (!exists) throw new AppError('Insurance scheme not found', 404);
    out.schemeId = schemeId;
  }
  if (!partial || has('memberNo')) {
    out.memberNo = str(body.memberNo, 100);
    if (!out.memberNo) throw new AppError('Member number is required', 400);
  }
  if (!partial || has('name')) {
    out.name = str(body.name);
    if (!out.name) throw new AppError('Member name is required', 400);
  }
  if (has('phone')) out.phone = str(body.phone, 50);
  if (has('group')) out.group = str(body.group);
  if (has('notes')) out.notes = str(body.notes, 1000);
  if (has('active')) out.active = body.active === true || body.active === 'true';
  if (has('validFrom')) out.validFrom = optionalDate(body.validFrom, 'valid from date');
  if (has('validTo')) out.validTo = optionalDate(body.validTo, 'valid to date');
  if (out.validFrom && out.validTo && out.validFrom > out.validTo) {
    throw new AppError('Valid from must be before valid to', 400);
  }
  if (has('patientId')) {
    out.patientId = optionalId(body.patientId, 'patient id');
    if (out.patientId) {
      const ok = await mongoose.model('Patient').exists({ _id: out.patientId, pharmacyId: req.pharmacyId });
      if (!ok) throw new AppError('Patient not found', 404);
    }
  }
  if (has('customerId')) {
    out.customerId = optionalId(body.customerId, 'customer id');
    if (out.customerId) {
      const ok = await mongoose.model('Customer').exists({ _id: out.customerId, pharmacyId: req.pharmacyId });
      if (!ok) throw new AppError('Customer not found', 404);
    }
  }
  return out;
};

const withValidity = (m, now = new Date()) => {
  const reason = svc.memberInvalidReason(m, now);
  return { ...m, valid: !reason, invalidReason: reason || null };
};

// @route GET /api/insurance/members   (?schemeId, ?search, ?active, ?page, ?limit)
const getMembers = async (req, res) => {
  const query = { pharmacyId: req.pharmacyId };
  if (req.query.schemeId) query.schemeId = optionalId(req.query.schemeId, 'scheme id');
  if (req.query.active === 'true') query.active = true;
  if (req.query.active === 'false') query.active = false;
  if (req.query.search) {
    const p = escapeRegex(str(req.query.search, 100));
    query.$or = [
      { name: { $regex: p, $options: 'i' } },
      { memberNo: { $regex: p, $options: 'i' } },
      { phone: { $regex: p, $options: 'i' } },
    ];
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIST, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const [members, total] = await Promise.all([
    InsuranceMember.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('schemeId', 'name type')
      .populate('patientId', 'name phone')
      .populate('customerId', 'name phone')
      .lean(),
    InsuranceMember.countDocuments(query),
  ]);
  const now = new Date();
  res.json({ success: true, members: members.map((m) => withValidity(m, now)), total, page, limit });
};

// @route GET /api/insurance/members/lookup?schemeId=&q=   (POS: by member number, name or phone)
const lookupMembers = async (req, res) => {
  const schemeId = optionalId(req.query.schemeId, 'scheme id');
  if (!schemeId) throw new AppError('Scheme is required', 400);
  const q = str(req.query.q, 100);
  const query = { pharmacyId: req.pharmacyId, schemeId };
  if (q) {
    const p = escapeRegex(q);
    query.$or = [
      { memberNo: { $regex: `^${p}`, $options: 'i' } },
      { name: { $regex: p, $options: 'i' } },
      { phone: { $regex: p, $options: 'i' } },
    ];
  }
  const members = await InsuranceMember.find(query)
    .select('memberNo name phone validFrom validTo active schemeId group')
    .sort({ name: 1 })
    .limit(10)
    .lean();
  const now = new Date();
  res.json({ success: true, members: members.map((m) => withValidity(m, now)) });
};

const findMember = async (req) => {
  assertId(req.params.id, 'member id');
  const member = await InsuranceMember.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!member) throw new AppError('Insurance member not found', 404);
  return member;
};

// @route POST /api/insurance/members
const createMember = async (req, res) => {
  const fields = await memberFields(req, req.body || {});
  try {
    const member = await InsuranceMember.create({ ...fields, pharmacyId: req.pharmacyId });
    await audit(req, { action: 'insurance.member_create', entity: 'InsuranceMember', entityId: member._id, after: member });
    res.status(201).json({ success: true, member });
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError('This member number already exists in the scheme', 409);
    throw err;
  }
};

// @route PUT /api/insurance/members/:id
const updateMember = async (req, res) => {
  const member = await findMember(req);
  const before = member.toObject();
  const fields = await memberFields(req, req.body || {}, { partial: true });
  member.set(fields);
  if (member.validFrom && member.validTo && member.validFrom > member.validTo) {
    throw new AppError('Valid from must be before valid to', 400);
  }
  try {
    await member.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw new AppError('This member number already exists in the scheme', 409);
    throw err;
  }
  await audit(req, { action: 'insurance.member_update', entity: 'InsuranceMember', entityId: member._id, before, after: member });
  res.json({ success: true, member });
};

// @route DELETE /api/insurance/members/:id   (only when no sale used the member)
const deleteMember = async (req, res) => {
  const member = await findMember(req);
  const used = await Sale.exists({ pharmacyId: req.pharmacyId, 'insurance.memberId': member._id });
  if (used) throw new AppError('This member has insurance sales. Deactivate the member instead.', 400);
  await InsuranceMember.deleteOne({ _id: member._id, pharmacyId: req.pharmacyId });
  await audit(req, { action: 'insurance.member_delete', entity: 'InsuranceMember', entityId: member._id, before: member });
  res.json({ success: true });
};

// ---------- POS preview ----------

// @route POST /api/insurance/preview   { schemeId, memberId?, memberNo?, lines: [{ medicineId, amount }] }
// `amount` = the line total after discount and tax as shown in the cart. The real split is
// recomputed when the sale is saved.
const previewSplit = async (req, res) => {
  const body = req.body || {};
  const lines = Array.isArray(body.lines) ? body.lines.slice(0, 200) : [];
  if (lines.length === 0) throw new AppError('lines are required', 400);
  lines.forEach((l) => assertId(l?.medicineId, 'medicine id'));
  const { scheme, member } = await svc.resolveInsuranceForSale({
    pharmacyId: req.pharmacyId,
    schemeId: body.schemeId,
    memberId: body.memberId,
    memberNo: body.memberNo,
  });
  const ids = [...new Set(lines.map((l) => String(l.medicineId)))];
  const meds = await Medicine.find({ _id: { $in: ids }, pharmacyId: req.pharmacyId }).select('name category').lean();
  const byId = new Map(meds.map((m) => [String(m._id), m]));
  const priced = lines.map((l) => ({
    medicine: byId.get(String(l.medicineId)) || null,
    gross: Math.max(0, round2(Number(l.amount) || 0)),
  }));
  const split = svc.computeInsuranceSplit({ scheme, lines: priced });
  res.json({
    success: true,
    scheme: { _id: scheme._id, name: scheme.name, coveragePercent: scheme.coveragePercent, copayType: scheme.copayType, copayValue: scheme.copayValue },
    member: { _id: member._id, memberNo: member.memberNo, name: member.name, validTo: member.validTo },
    eligibleAmount: split.eligibleAmount,
    coveredAmount: split.coveredAmount,
    copayAmount: split.copayAmount,
    insurerAmount: split.insurerAmount,
    patientAmount: split.patientAmount,
    lines: priced.map((p, i) => ({
      medicineId: lines[i].medicineId,
      name: p.medicine?.name || '',
      covered: split.lineCovered[i],
      insurerAmount: split.lineInsurer[i],
    })),
  });
};

// ---------- Claims ----------

const CLAIM_LIST_FIELDS = '-sales';

// @route GET /api/insurance/claims   (?schemeId, ?status, ?page, ?limit)
const getClaims = async (req, res) => {
  const query = { pharmacyId: req.pharmacyId };
  if (req.query.schemeId) query.schemeId = optionalId(req.query.schemeId, 'scheme id');
  if (req.query.status) {
    if (!InsuranceClaim.CLAIM_STATUSES.includes(req.query.status)) throw new AppError('Invalid status', 400);
    query.status = req.query.status;
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIST, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const [claims, total] = await Promise.all([
    InsuranceClaim.find(query).select(CLAIM_LIST_FIELDS).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    InsuranceClaim.countDocuments(query),
  ]);
  const counts = await InsuranceClaim.aggregate([
    { $match: query },
    { $project: { n: { $size: '$sales' } } },
  ]);
  const nById = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    success: true,
    claims: claims.map((c) => ({ ...c, saleCount: nById.get(String(c._id)) || 0, outstanding: InsuranceClaim.claimBalance(c).outstanding, refundDueToInsurer: InsuranceClaim.claimBalance(c).refundDueToInsurer })),
    total,
    page,
    limit,
  });
};

// @route GET /api/insurance/claims/unclaimed?schemeId=&from=&to=   (preview before building)
const getUnclaimed = async (req, res) => {
  const schemeId = optionalId(req.query.schemeId, 'scheme id');
  if (!schemeId) throw new AppError('Scheme is required', 400);
  const { periodFrom, periodTo } = svc.parseRange(req.query.from, req.query.to);
  const rows = (await svc.findUnclaimed({ pharmacyId: req.pharmacyId, schemeId, periodFrom, periodTo }))
    .filter((r) => r.amount > 0);
  res.json({
    success: true,
    sales: rows.map((r) => ({
      saleId: r.sale._id,
      invoiceNumber: r.sale.invoiceNumber,
      saleDate: r.sale.createdAt,
      memberNo: r.sale.insurance?.memberNo,
      memberName: r.sale.insurance?.memberName,
      saleTotal: r.sale.grandTotal,
      insurerAmount: r.insurer,
      returnedAmount: r.returned,
      amount: r.amount,
    })),
    total: round2(rows.reduce((s, r) => s + r.amount, 0)),
  });
};

const claimResponse = async (req, claim) => {
  const scheme = await InsuranceScheme.findOne({ _id: claim.schemeId, pharmacyId: req.pharmacyId })
    .select('name type code payer')
    .lean();
  const obj = typeof claim.toObject === 'function' ? claim.toObject() : claim;
  return { ...obj, outstanding: InsuranceClaim.claimBalance(obj).outstanding, refundDueToInsurer: InsuranceClaim.claimBalance(obj).refundDueToInsurer, scheme };
};

// @route POST /api/insurance/claims   { schemeId, from, to, notes? }
const createClaim = async (req, res) => {
  const body = req.body || {};
  const claim = await withTransaction(async (session) => {
    const c = await svc.buildClaim(
      { pharmacyId: req.pharmacyId, schemeId: body.schemeId, from: body.from, to: body.to, notes: body.notes, userId: req.user._id },
      { session }
    );
    await audit(
      req,
      { action: 'insurance.claim_create', entity: 'InsuranceClaim', entityId: c._id, meta: { claimNumber: c.claimNumber, totalAmount: c.totalAmount, sales: c.sales.length } },
      { session }
    );
    return c;
  });
  res.status(201).json({ success: true, claim: await claimResponse(req, claim) });
};

// @route GET /api/insurance/claims/:id
const getClaim = async (req, res) => {
  const claim = await svc.loadClaim(req.pharmacyId, req.params.id);
  res.json({ success: true, claim: await claimResponse(req, claim) });
};

const claimAction = (action, run) => async (req, res) => {
  const claim = await withTransaction(async (session) => {
    const c = await run(req, session);
    await audit(
      req,
      {
        action: `insurance.claim_${action}`,
        entity: 'InsuranceClaim',
        entityId: c._id,
        meta: { claimNumber: c.claimNumber, status: c.status, totalAmount: c.totalAmount, paidAmount: c.paidAmount },
      },
      { session }
    );
    return c;
  });
  if (action === 'delete') return res.json({ success: true });
  return res.json({ success: true, claim: await claimResponse(req, claim) });
};

// @route POST /api/insurance/claims/:id/refresh   (draft: recompute net of returns/voids)
const refreshClaim = claimAction('refresh', async (req, session) => {
  const claim = await svc.loadClaim(req.pharmacyId, req.params.id, { session });
  return svc.refreshDraftClaim(claim, { session });
});

// @route POST /api/insurance/claims/:id/submit
const submitClaim = claimAction('submit', (req, session) =>
  svc.submitClaim({ pharmacyId: req.pharmacyId, id: req.params.id, userId: req.user._id }, { session }));

// @route POST /api/insurance/claims/:id/payments   { amount, date?, reference?, note? }
// Only whitelisted body fields: pharmacyId / id must never come from the client.
const recordClaimPayment = claimAction('payment', (req, session) => {
  const { amount, date, reference, note } = req.body || {};
  return svc.recordClaimPayment(
    {
      pharmacyId: req.pharmacyId,
      id: req.params.id,
      amount,
      date: typeof date === 'string' || typeof date === 'number' ? date : undefined,
      reference: typeof reference === 'string' ? reference : undefined,
      note: typeof note === 'string' ? note : undefined,
      userId: req.user._id,
    },
    { session }
  );
});

// @route POST /api/insurance/claims/:id/reject   { notes, releaseSales? }
const rejectClaim = claimAction('reject', (req, session) =>
  svc.rejectClaim(
    { pharmacyId: req.pharmacyId, id: req.params.id, notes: req.body?.notes, releaseSales: req.body?.releaseSales },
    { session }
  ));

// @route DELETE /api/insurance/claims/:id   (draft only; releases its sales)
const deleteClaim = claimAction('delete', (req, session) =>
  svc.deleteDraftClaim({ pharmacyId: req.pharmacyId, id: req.params.id }, { session }));

// @route GET /api/insurance/claims/:id/export   (Excel)
const exportClaim = async (req, res) => {
  const claim = await svc.loadClaim(req.pharmacyId, req.params.id);
  const scheme = await InsuranceScheme.findOne({ _id: claim.schemeId, pharmacyId: req.pharmacyId }).lean();
  const buffer = await svc.claimWorkbook({ claim, scheme, pharmacy: req.pharmacy });
  await audit(req, { action: 'insurance.claim_export', entity: 'InsuranceClaim', entityId: claim._id, meta: { claimNumber: claim.claimNumber } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${claim.claimNumber}.xlsx"`);
  res.send(Buffer.from(buffer));
};

// @route GET /api/insurance/receivables
const getReceivables = async (req, res) => {
  const summary = await svc.receivablesSummary({ pharmacyId: req.pharmacyId });
  res.json({ success: true, ...summary });
};

module.exports = {
  getSchemes,
  getScheme,
  createScheme,
  updateScheme,
  deleteScheme,
  getMembers,
  lookupMembers,
  createMember,
  updateMember,
  deleteMember,
  previewSplit,
  getClaims,
  getUnclaimed,
  createClaim,
  getClaim,
  refreshClaim,
  submitClaim,
  recordClaimPayment,
  rejectClaim,
  deleteClaim,
  exportClaim,
  getReceivables,
};
