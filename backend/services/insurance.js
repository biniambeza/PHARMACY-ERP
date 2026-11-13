// Insurance / credit-scheme billing (CBHI, employer schemes, private insurers). Owner: Insurance agent.
//
// Sale side (called from services/sales.js):
//   resolveInsuranceForSale({ pharmacyId, schemeId, memberId, memberNo, date }, { session })
//       -> { scheme, member }  (throws AppError when the scheme is inactive or the member invalid)
//   computeInsuranceSplit({ scheme, lines: [{ medicine, gross }], grandTotal })
//       -> { eligibleAmount, coveredAmount, copayAmount, insurerAmount, patientAmount, lineInsurer, lineCovered }
//
// Split rules (all money rounded to 2 decimals):
//   gross line     = line total - its share of the discount + its tax (when tax is exclusive)
//   eligible       = sum of gross lines whose medicine is not excluded (by id or category)
//   covered        = eligible * coveragePercent / 100
//   copay          = percent: covered * copayValue / 100; fixed: copayValue per sale; capped at covered
//   insurer        = covered - copay, capped at maxPerSale (when > 0) and at the grand total
//   patient        = grandTotal - insurer (paid through the normal methods)
// The insurer share is stored as a `pending` payment line (method 'insurance') and per item in
// items[].insuranceAmount, so returns can be netted out precisely.
//
// Claims never depend on the returns code: the claimable amount of a sale is computed from the
// Return records (returned quantity / sold quantity * insuranceAmount of each sale item).
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const InsuranceScheme = require('../models/InsuranceScheme');
const InsuranceMember = require('../models/InsuranceMember');
const InsuranceClaim = require('../models/InsuranceClaim');
const Sale = require('../models/Sale');
const Return = require('../models/Return');
const { nextSequence, formatSequence } = require('../utils/sequence');

const EPS = 0.005;
const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const codedError = (message, status, code) => {
  const err = new AppError(message, status);
  err.code = code;
  return err;
};

const toId = (v, label) => {
  const raw = v && v._id ? v._id : v;
  if (!raw || !mongoose.isValidObjectId(raw)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(String(raw));
};

// Splits `total` over parts proportionally to `weights` (same rounding as services/sales.js).
const splitAmount = (total, weights) => {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  let left = round2(total);
  return weights.map((w, i) => {
    if (i === weights.length - 1) return round2(left);
    const part = round2((total * w) / sum);
    left = round2(left - part);
    return part;
  });
};

// ---------- Members and coverage ----------

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Why a member can't be used on `date` ('' = valid).
const memberInvalidReason = (member, date = new Date()) => {
  if (!member) return 'not_found';
  if (member.active === false) return 'inactive';
  if (member.validFrom && startOfDay(member.validFrom) > date) return 'not_yet_valid';
  if (member.validTo && endOfDay(member.validTo) < date) return 'expired';
  return '';
};

const isMedicineCovered = (scheme, medicine) => {
  if (!medicine) return false;
  const excludedIds = (scheme.excludedMedicineIds || []).map(String);
  if (excludedIds.includes(String(medicine._id))) return false;
  const category = String(medicine.category || '').trim().toLowerCase();
  const excludedCats = (scheme.excludedCategories || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  if (category && excludedCats.includes(category)) return false;
  return true;
};

const computeInsuranceSplit = ({ scheme, lines, grandTotal }) => {
  const total = round2(grandTotal !== undefined ? grandTotal : lines.reduce((s, l) => s + (Number(l.gross) || 0), 0));
  const lineCovered = lines.map((l) => isMedicineCovered(scheme, l.medicine));
  const eligibleAmount = round2(
    Math.min(total, lines.reduce((s, l, i) => s + (lineCovered[i] ? Math.max(0, Number(l.gross) || 0) : 0), 0))
  );
  const pct = Math.min(100, Math.max(0, Number(scheme.coveragePercent ?? 100)));
  const coveredAmount = round2((eligibleAmount * pct) / 100);

  let copayAmount = 0;
  const copayValue = Math.max(0, Number(scheme.copayValue) || 0);
  if (scheme.copayType === 'percent') copayAmount = round2((coveredAmount * Math.min(100, copayValue)) / 100);
  else if (scheme.copayType === 'fixed') copayAmount = round2(copayValue);
  copayAmount = round2(Math.min(copayAmount, coveredAmount));

  let insurerAmount = round2(coveredAmount - copayAmount);
  const cap = Number(scheme.maxPerSale) || 0;
  if (cap > 0) insurerAmount = round2(Math.min(insurerAmount, cap));
  insurerAmount = round2(Math.max(0, Math.min(insurerAmount, total)));

  const lineInsurer = splitAmount(
    insurerAmount,
    lines.map((l, i) => (lineCovered[i] ? Math.max(0, Number(l.gross) || 0) : 0))
  );

  return {
    eligibleAmount,
    coveredAmount,
    copayAmount,
    insurerAmount,
    patientAmount: round2(Math.max(0, total - insurerAmount)),
    coveragePercent: pct,
    lineInsurer,
    lineCovered,
  };
};

// Loads and validates the scheme + member for an insurance sale.
const resolveInsuranceForSale = async ({ pharmacyId, schemeId, memberId, memberNo, date = new Date() }, { session } = {}) => {
  if (!schemeId) throw codedError('Select an insurance scheme', 400, 'INSURANCE_SCHEME_REQUIRED');
  const scheme = await InsuranceScheme.findOne({ _id: toId(schemeId, 'scheme id'), pharmacyId }).session(session || null);
  if (!scheme) throw codedError('Insurance scheme not found', 404, 'INSURANCE_SCHEME_NOT_FOUND');
  if (!scheme.active) throw codedError(`Insurance scheme "${scheme.name}" is not active`, 400, 'INSURANCE_SCHEME_INACTIVE');

  let member = null;
  if (memberId) {
    member = await InsuranceMember.findOne({ _id: toId(memberId, 'member id'), pharmacyId, schemeId: scheme._id })
      .session(session || null);
  } else if (memberNo) {
    member = await InsuranceMember.findOne({ pharmacyId, schemeId: scheme._id, memberNo: String(memberNo).trim() })
      .session(session || null);
  } else {
    throw codedError('Select an insurance member', 400, 'INSURANCE_MEMBER_REQUIRED');
  }
  const reason = memberInvalidReason(member, date);
  if (reason) {
    const messages = {
      not_found: 'Insurance member not found for this scheme',
      inactive: 'Insurance member is not active',
      not_yet_valid: 'Insurance membership is not valid yet',
      expired: 'Insurance membership has expired',
    };
    throw codedError(messages[reason], reason === 'not_found' ? 404 : 400, 'INSURANCE_MEMBER_INVALID');
  }
  return { scheme, member };
};

// ---------- Claimable amounts (net of returns) ----------

// sales: Sale docs/lean objects with items + insurance. Returns Map saleId -> { insurer, returned, amount }.
const claimableForSales = async (pharmacyId, sales, { session } = {}) => {
  const result = new Map();
  if (sales.length === 0) return result;
  const returns = await Return.find({ pharmacyId, saleId: { $in: sales.map((s) => s._id) } })
    .select('saleId items.saleItemId items.quantity')
    .session(session || null)
    .lean();
  const bySale = new Map();
  returns.forEach((r) => {
    const key = String(r.saleId);
    if (!bySale.has(key)) bySale.set(key, []);
    bySale.get(key).push(...(r.items || []));
  });

  sales.forEach((sale) => {
    const insurer = round2(sale.insurance?.insurerAmount || 0);
    const itemById = new Map((sale.items || []).map((i) => [String(i._id), i]));
    let returned = 0;
    (bySale.get(String(sale._id)) || []).forEach((ri) => {
      const si = itemById.get(String(ri.saleItemId));
      if (!si || !si.quantity) return;
      returned += ((Number(si.insuranceAmount) || 0) * Math.min(ri.quantity, si.quantity)) / si.quantity;
    });
    returned = round2(Math.min(insurer, returned));
    if (sale.returnStatus === 'full') returned = insurer;
    result.set(String(sale._id), { insurer, returned, amount: round2(Math.max(0, insurer - returned)) });
  });
  return result;
};

// Insurer share of a set of returned sale items: items = [{ saleItemId, quantity }].
// For the returns flow: the patient should only be refunded refundTotal - this amount
// (the insurer share is taken off the claim automatically by claimableForSales).
const insuranceShareOfReturn = (sale, items) => {
  if (!sale || !sale.insurance) return 0;
  const byId = new Map((sale.items || []).map((i) => [String(i._id), i]));
  const total = (items || []).reduce((s, ri) => {
    const si = byId.get(String(ri.saleItemId));
    if (!si || !si.quantity) return s;
    return s + ((Number(si.insuranceAmount) || 0) * Math.min(Number(ri.quantity) || 0, si.quantity)) / si.quantity;
  }, 0);
  return round2(total);
};

const SALE_FIELDS ='invoiceNumber createdAt grandTotal items._id items.quantity items.insuranceAmount insurance returnStatus voided';

const parseRange = (from, to) => {
  const f = from ? new Date(from) : null;
  const t = to ? new Date(to) : null;
  if (!f || Number.isNaN(f.getTime()) || !t || Number.isNaN(t.getTime())) {
    throw new AppError('A valid period (from, to) is required', 400);
  }
  const periodFrom = startOfDay(f);
  const periodTo = endOfDay(t);
  if (periodFrom > periodTo) throw new AppError('Period start must be before the end', 400);
  return { periodFrom, periodTo };
};

// Unclaimed, non-voided insurance sales of a scheme in a period, with claimable amounts.
const findUnclaimed = async ({ pharmacyId, schemeId, periodFrom, periodTo }, { session } = {}) => {
  const filter = {
    pharmacyId,
    'insurance.schemeId': schemeId,
    'insurance.claimId': null,
    voided: { $ne: true },
  };
  if (periodFrom || periodTo) {
    filter.createdAt = {};
    if (periodFrom) filter.createdAt.$gte = periodFrom;
    if (periodTo) filter.createdAt.$lte = periodTo;
  }
  const sales = await Sale.find(filter).select(SALE_FIELDS).sort({ createdAt: 1 }).session(session || null).lean();
  const claimable = await claimableForSales(pharmacyId, sales, { session });
  return sales.map((s) => ({ sale: s, ...claimable.get(String(s._id)) }));
};

const toClaimLine = ({ sale, insurer, returned, amount }) => ({
  saleId: sale._id,
  invoiceNumber: sale.invoiceNumber,
  saleDate: sale.createdAt,
  memberId: sale.insurance?.memberId || null,
  memberNo: sale.insurance?.memberNo || '',
  memberName: sale.insurance?.memberName || '',
  saleTotal: round2(sale.grandTotal || 0),
  insurerAmount: insurer,
  returnedAmount: returned,
  amount,
});

// ---------- Claims ----------

const buildClaim = async ({ pharmacyId, schemeId, from, to, notes, userId }, { session }) => {
  const sid = toId(schemeId, 'scheme id');
  const scheme = await InsuranceScheme.findOne({ _id: sid, pharmacyId }).session(session);
  if (!scheme) throw new AppError('Insurance scheme not found', 404);
  const { periodFrom, periodTo } = parseRange(from, to);

  const rows = (await findUnclaimed({ pharmacyId, schemeId: sid, periodFrom, periodTo }, { session }))
    .filter((r) => r.amount > EPS);
  if (rows.length === 0) throw codedError('No unclaimed insurance sales in this period', 400, 'NOTHING_TO_CLAIM');

  const lines = rows.map(toClaimLine);
  const seq = await nextSequence(pharmacyId, 'insurance_claim', { session });
  const [claim] = await InsuranceClaim.create(
    [
      {
        pharmacyId,
        schemeId: sid,
        schemeName: scheme.name,
        claimNumber: formatSequence('CLM', seq),
        periodFrom,
        periodTo,
        sales: lines,
        totalAmount: round2(lines.reduce((s, l) => s + l.amount, 0)),
        notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : '',
        createdBy: userId,
      },
    ],
    { session }
  );

  const ids = lines.map((l) => l.saleId);
  const res = await Sale.updateMany(
    { _id: { $in: ids }, pharmacyId, 'insurance.claimId': null },
    { $set: { 'insurance.claimId': claim._id } },
    { session }
  );
  if (res.modifiedCount !== ids.length) {
    throw new AppError('Some sales were claimed at the same time, please retry', 409);
  }
  return claim;
};

const loadClaim = async (pharmacyId, id, { session } = {}) => {
  const claim = await InsuranceClaim.findOne({ _id: toId(id, 'claim id'), pharmacyId }).session(session || null);
  if (!claim) throw new AppError('Claim not found', 404);
  return claim;
};

// Recomputes the amounts of a draft claim (returns and voids since it was built).
// Sales that are voided or fully returned are dropped and released.
const refreshDraftClaim = async (claim, { session }) => {
  if (claim.status !== 'draft') throw new AppError('Only draft claims can be refreshed', 400);
  const sales = await Sale.find({ _id: { $in: claim.sales.map((s) => s.saleId) }, pharmacyId: claim.pharmacyId })
    .select(SALE_FIELDS)
    .session(session)
    .lean();
  const claimable = await claimableForSales(claim.pharmacyId, sales, { session });
  const keep = [];
  const drop = [];
  sales.forEach((sale) => {
    const c = claimable.get(String(sale._id));
    if (sale.voided || !c || c.amount <= EPS) drop.push(sale._id);
    else keep.push(toClaimLine({ sale, ...c }));
  });
  // Sales that disappeared are dropped too
  const found = new Set(sales.map((s) => String(s._id)));
  claim.sales.forEach((l) => {
    if (!found.has(String(l.saleId))) drop.push(l.saleId);
  });
  if (drop.length > 0) {
    await Sale.updateMany(
      { _id: { $in: drop }, pharmacyId: claim.pharmacyId, 'insurance.claimId': claim._id },
      { $set: { 'insurance.claimId': null } },
      { session }
    );
  }
  keep.sort((a, b) => new Date(a.saleDate) - new Date(b.saleDate));
  claim.sales = keep;
  claim.totalAmount = round2(keep.reduce((s, l) => s + l.amount, 0));
  await claim.save({ session });
  return claim;
};

const submitClaim = async ({ pharmacyId, id, userId }, { session }) => {
  const claim = await loadClaim(pharmacyId, id, { session });
  if (claim.status !== 'draft') throw new AppError('Only draft claims can be submitted', 400);
  await refreshDraftClaim(claim, { session });
  if (claim.sales.length === 0 || claim.totalAmount <= EPS) {
    throw new AppError('This claim has nothing left to claim', 400);
  }
  claim.status = 'submitted';
  claim.submittedAt = new Date();
  claim.submittedBy = userId;
  await claim.save({ session });
  return claim;
};

const markSalesInsurancePaid = (claim, { session }) =>
  Sale.updateMany(
    { _id: { $in: claim.sales.map((s) => s.saleId) }, pharmacyId: claim.pharmacyId },
    { $set: { 'payments.$[p].status': 'completed' } },
    { arrayFilters: [{ 'p.method': 'insurance', 'p.status': 'pending' }], session }
  );

const recordClaimPayment = async ({ pharmacyId, id, amount, date, reference, note, userId }, { session }) => {
  const claim = await loadClaim(pharmacyId, id, { session });
  if (!['submitted', 'partially_paid'].includes(claim.status)) {
    throw new AppError('Payments can only be recorded on submitted claims', 400);
  }
  const value = round2(amount);
  if (!Number.isFinite(Number(amount)) || value <= 0) throw new AppError('Payment amount must be a positive number', 400);
  const outstanding = round2(claim.totalAmount - claim.paidAmount);
  if (value > outstanding + EPS) {
    throw new AppError(`Payment (${value.toFixed(2)}) exceeds the outstanding amount (${outstanding.toFixed(2)})`, 400);
  }
  let when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) when = new Date();

  claim.payments.push({
    amount: value,
    date: when,
    reference: typeof reference === 'string' ? reference.trim().slice(0, 100) : '',
    note: typeof note === 'string' ? note.trim().slice(0, 500) : '',
    recordedBy: userId,
  });
  claim.paidAmount = round2(claim.paidAmount + value);
  const fullyPaid = claim.totalAmount - claim.paidAmount <= EPS;
  claim.status = fullyPaid ? 'paid' : 'partially_paid';
  await claim.save({ session });
  if (fullyPaid) await markSalesInsurancePaid(claim, { session });
  return claim;
};

// Rejects a submitted claim. Without payments the sales go back to the unclaimed pool by default
// (so a corrected claim can be built); otherwise the unpaid part is written off.
const rejectClaim = async ({ pharmacyId, id, notes, releaseSales = true }, { session }) => {
  const claim = await loadClaim(pharmacyId, id, { session });
  if (!['submitted', 'partially_paid'].includes(claim.status)) {
    throw new AppError('Only submitted claims can be rejected', 400);
  }
  const text = typeof notes === 'string' ? notes.trim() : '';
  if (!text) throw new AppError('Rejection notes are required', 400);
  const release = releaseSales !== false && releaseSales !== 'false' && claim.paidAmount <= EPS;
  claim.status = 'rejected';
  claim.rejectedAt = new Date();
  claim.rejectionNotes = text.slice(0, 1000);
  claim.salesReleased = release;
  await claim.save({ session });
  if (release) {
    await Sale.updateMany(
      { _id: { $in: claim.sales.map((s) => s.saleId) }, pharmacyId, 'insurance.claimId': claim._id },
      { $set: { 'insurance.claimId': null } },
      { session }
    );
  }
  return claim;
};

const deleteDraftClaim = async ({ pharmacyId, id }, { session }) => {
  const claim = await loadClaim(pharmacyId, id, { session });
  if (claim.status !== 'draft') throw new AppError('Only draft claims can be deleted', 400);
  await Sale.updateMany(
    { pharmacyId, 'insurance.claimId': claim._id },
    { $set: { 'insurance.claimId': null } },
    { session }
  );
  await InsuranceClaim.deleteOne({ _id: claim._id, pharmacyId }, { session });
  return claim;
};

// ---------- Receivables ----------

const BUCKETS = ['0_30', '31_60', '61_90', '90_plus'];
const bucketOf = (date, now) => {
  const days = Math.floor((now - new Date(date)) / DAY_MS);
  if (days <= 30) return '0_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return '90_plus';
};
const emptyAging = () => Object.fromEntries(BUCKETS.map((b) => [b, 0]));

// Outstanding per scheme: unclaimed sales (aged by sale date), draft claims (by period end) and
// submitted / partially paid claims (by submission date).
const receivablesSummary = async ({ pharmacyId, now = new Date() }) => {
  const schemes = await InsuranceScheme.find({ pharmacyId }).select('name type active').sort({ name: 1 }).lean();
  const rows = new Map(
    schemes.map((s) => [
      String(s._id),
      {
        schemeId: s._id,
        name: s.name,
        type: s.type,
        active: s.active,
        unclaimed: 0,
        unclaimedCount: 0,
        draft: 0,
        submitted: 0,
        outstanding: 0,
        aging: emptyAging(),
      },
    ])
  );

  const sales = await Sale.find({
    pharmacyId,
    'insurance.schemeId': { $exists: true },
    'insurance.claimId': null,
    voided: { $ne: true },
  })
    .select(SALE_FIELDS)
    .lean();
  const claimable = await claimableForSales(pharmacyId, sales);
  sales.forEach((s) => {
    const row = rows.get(String(s.insurance.schemeId));
    const c = claimable.get(String(s._id));
    if (!row || !c || c.amount <= EPS) return;
    row.unclaimed = round2(row.unclaimed + c.amount);
    row.unclaimedCount += 1;
    const b = bucketOf(s.createdAt, now);
    row.aging[b] = round2(row.aging[b] + c.amount);
  });

  const claims = await InsuranceClaim.find({ pharmacyId, status: { $in: ['draft', 'submitted', 'partially_paid'] } })
    .select('schemeId status totalAmount paidAmount submittedAt periodTo createdAt')
    .lean();
  claims.forEach((c) => {
    const row = rows.get(String(c.schemeId));
    if (!row) return;
    const open = round2(c.totalAmount - (c.paidAmount || 0));
    if (open <= EPS) return;
    if (c.status === 'draft') row.draft = round2(row.draft + open);
    else row.submitted = round2(row.submitted + open);
    const b = bucketOf(c.status === 'draft' ? c.periodTo || c.createdAt : c.submittedAt || c.createdAt, now);
    row.aging[b] = round2(row.aging[b] + open);
  });

  const list = [...rows.values()].map((r) => ({ ...r, outstanding: round2(r.unclaimed + r.draft + r.submitted) }));
  const totals = list.reduce(
    (acc, r) => {
      acc.unclaimed = round2(acc.unclaimed + r.unclaimed);
      acc.draft = round2(acc.draft + r.draft);
      acc.submitted = round2(acc.submitted + r.submitted);
      acc.outstanding = round2(acc.outstanding + r.outstanding);
      BUCKETS.forEach((b) => {
        acc.aging[b] = round2(acc.aging[b] + r.aging[b]);
      });
      return acc;
    },
    { unclaimed: 0, draft: 0, submitted: 0, outstanding: 0, aging: emptyAging() }
  );
  return { schemes: list, totals, buckets: BUCKETS };
};

// ---------- Export ----------

const claimWorkbook = async ({ claim, scheme, pharmacy }) => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pharmacy ERP';
  const ws = wb.addWorksheet('Claim');
  const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

  ws.addRow([pharmacy?.name || '']).font = { bold: true, size: 14 };
  if (pharmacy?.address) ws.addRow([pharmacy.address]);
  ws.addRow([]);
  [
    ['Claim number', claim.claimNumber],
    ['Scheme', scheme?.name || claim.schemeName],
    ['Payer', scheme?.payer?.name || ''],
    ['Period', `${fmtDate(claim.periodFrom)} - ${fmtDate(claim.periodTo)}`],
    ['Status', claim.status],
    ['Submitted', fmtDate(claim.submittedAt)],
  ].forEach(([k, v]) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  });
  ws.addRow([]);

  const header = ws.addRow(['#', 'Date', 'Invoice', 'Member no', 'Member name', 'Sale total', 'Insurer share', 'Returned', 'Claimed']);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    c.border = { bottom: { style: 'thin' } };
  });
  claim.sales.forEach((l, i) => {
    ws.addRow([
      i + 1,
      fmtDate(l.saleDate),
      l.invoiceNumber,
      l.memberNo,
      l.memberName,
      l.saleTotal,
      l.insurerAmount,
      l.returnedAmount,
      l.amount,
    ]);
  });
  const totalRow = ws.addRow(['', '', '', '', 'Total', '', '', '', claim.totalAmount]);
  totalRow.font = { bold: true };
  if (claim.paidAmount > 0) {
    ws.addRow(['', '', '', '', 'Paid', '', '', '', claim.paidAmount]).font = { bold: true };
    ws.addRow(['', '', '', '', 'Outstanding', '', '', '', round2(claim.totalAmount - claim.paidAmount)]).font = { bold: true };
  }
  [5, 12, 18, 16, 28, 12, 14, 12, 12].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  [6, 7, 8, 9].forEach((c) => {
    ws.getColumn(c).numFmt = '#,##0.00';
  });
  return wb.xlsx.writeBuffer();
};

module.exports = {
  round2,
  memberInvalidReason,
  isMedicineCovered,
  computeInsuranceSplit,
  resolveInsuranceForSale,
  claimableForSales,
  insuranceShareOfReturn,
  findUnclaimed,
  parseRange,
  buildClaim,
  loadClaim,
  refreshDraftClaim,
  submitClaim,
  recordClaimPayment,
  rejectClaim,
  deleteDraftClaim,
  receivablesSummary,
  claimWorkbook,
  BUCKETS,
};
