// Sale processing (POS #3, #6, #7, #13, #16-#18, #22, #26, #27). Owner: POS agent.
//
//   processSale(ctx, payload, { session?, offline? }) -> { sale, duplicate }
//
// ctx:     { pharmacyId, user, membershipRole, pharmacy, timezone?, req? }
// payload: {
//   items: [{ medicineId, quantity, unitName? }]   quantity is in `unitName` units (pack units
//          multiply by the pack factor; stock is always deducted in base units)
//   customerId?, customer?: { name, phone }, patientId?, prescriptionId?,
//   prescription?: { number, prescriber, notes }   (legacy free-text prescription)
//   discount?, notes?, offlineId?,
//   clinicalAck?: true when the pharmacist acknowledged severe allergy / interaction warnings
//          (required when a patient is selected and services/clinical finds any; 409 CLINICAL_ACK_REQUIRED)
//   items[].unitPrice?, clientTotal?  (offline sync only: the price per sold unit and the total
//          the client charged; see "Offline sync rules" below)
//   payments?: [{ method: cash|card|mobile_money|credit|insurance, amount, reference?, provider?, intentId?,
//                 schemeId?, memberId?, memberNo? }]
//          insurance: at most one line; its amount is ignored and computed server-side from the
//          scheme rules (services/insurance.js). The other lines must cover the patient share.
//   paymentMethod?  (legacy single method; the whole total is paid with it)
//   amountTendered? (legacy single cash payment: cash handed over)
// }
//
// Without `session` processSale opens its own session + transaction. With a session the
// caller owns the transaction (processSale only runs the work inside it).
// `offline: true` (offline sync) only allows cash/card payments (no insurance) and no controlled medicines.
//
// Offline sync rules (`offline: true`):
//   - prices: the client's unit price is kept when it is >= the medicine's cost price, otherwise the
//     current price is used. If the payments then don't cover the total, the difference is absorbed
//     as a discount (the goods are already gone) and the sale is flagged offlinePriceAdjusted.
//   - time: createdAtClient may be at most 5 minutes in the future and at most 7 days old; outside
//     that the sale is accepted with createdAt = sync time and flagged (offlineTimeFlag). Otherwise
//     createdAt (what reports use) = offlineCreatedAt = the client time.
//   - shift: the seller's shift that was open at the client time, else the currently open one;
//     an offline sale is accepted without a shift even when the pharmacy requires one.
//   - the clinical acknowledgement gate is not applied (the sale already happened).
//
// Guarantees: everything is validated before the first write; stock is taken FEFO from
// active, unexpired batches with atomic conditional decrements; a sale with an
// offlineId that already exists for the pharmacy is returned instead of re-created.
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Shift = require('../models/Shift');
const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');
const PaymentIntent = require('../models/PaymentIntent');
const AppError = require('../utils/AppError');
const { can } = require('../config/permissions');
const { nextSequence, formatSequence } = require('../utils/sequence');
const { recordMovement } = require('../utils/stockMovement');
const { computeTax, getTaxSettings } = require('./tax');
const { assertCreditAllowed, applyCreditSale } = require('./credit');
const { recordControlledDispenses, recordPrescriptionDispense, checkSaleClinical } = require('./clinical');
const { resolveInsuranceForSale, computeInsuranceSplit } = require('./insurance');

const PAYMENT_METHODS = ['cash', 'card', 'mobile_money', 'credit', 'insurance'];
const OFFLINE_METHODS = ['cash', 'card'];
const EPS = 0.005;
const MAX_ITEMS = 200;
// Interaction severities that need an explicit acknowledgement (same as the POS)
const SEVERE_INTERACTIONS = ['major', 'contraindicated'];
const OFFLINE_MAX_FUTURE_MS = 5 * 60 * 1000;
const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cleanString = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const codedError = (message, status, code) => {
  const err = new AppError(message, status);
  err.code = code;
  return err;
};

const optionalId = (v, label) => {
  if (v === undefined || v === null || v === '') return null;
  const raw = v && v._id ? v._id : v;
  if (!mongoose.isValidObjectId(raw)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(String(raw));
};

// Shift requirement is opt-in per pharmacy (settings.requireShift). Pharmacies without the
// setting (legacy docs, test fixtures) don't require a shift. See docs in the POS report.
const shiftRequired = (pharmacy) => Boolean(pharmacy && pharmacy.settings && pharmacy.settings.requireShift === true);

// ---------- Validation of the request body (no DB access) ----------

const normalizePayload = (payload = {}, { offline = false } = {}) => {
  const { items } = payload;
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Sale must contain at least one item', 400);
  }
  if (items.length > MAX_ITEMS) throw new AppError(`A sale can have at most ${MAX_ITEMS} lines`, 400);

  const lines = items.map((item) => {
    const qty = Number(item?.quantity);
    if (
      !item?.medicineId ||
      !mongoose.isValidObjectId(item.medicineId) ||
      !Number.isInteger(qty) ||
      qty <= 0
    ) {
      throw new AppError('Invalid item data provided', 400);
    }
    const unitPrice = item.unitPrice === undefined || item.unitPrice === null || item.unitPrice === ''
      ? null
      : Number(item.unitPrice);
    return {
      medicineId: String(item.medicineId),
      quantity: qty,
      unitName: cleanString(item.unitName, 50),
      // Only used for offline sync (see the offline rules above)
      clientUnitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? round2(unitPrice) : null,
    };
  });

  const discount = payload.discount === undefined || payload.discount === '' ? 0 : Number(payload.discount);
  // `tax` from the client is no longer used (tax is computed from the pharmacy settings),
  // but a negative value is still rejected for backwards compatibility.
  const legacyTax = payload.tax === undefined || payload.tax === '' ? 0 : Number(payload.tax);
  if (!Number.isFinite(discount) || !Number.isFinite(legacyTax) || discount < 0 || legacyTax < 0) {
    throw new AppError('Discount and tax must be non-negative numbers', 400);
  }

  // Payments: explicit split payments, or the legacy single paymentMethod
  let payments = null;
  let legacyMethod = null;
  if (Array.isArray(payload.payments) && payload.payments.length > 0) {
    if (payload.payments.length > 10) throw new AppError('Too many payment lines', 400);
    payments = payload.payments.map((p) => {
      const method = cleanString(p?.method, 30);
      if (!PAYMENT_METHODS.includes(method)) throw new AppError('Invalid payment method', 400);
      if (method === 'insurance') {
        // The insurer share is computed server-side; the client amount is ignored
        return {
          method,
          amount: 0,
          reference: cleanString(p.reference, 100),
          provider: '',
          intentId: null,
          schemeId: optionalId(p.schemeId, 'insurance scheme id'),
          memberId: optionalId(p.memberId, 'insurance member id'),
          memberNo: cleanString(p.memberNo, 100),
        };
      }
      const amount = Number(p?.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new AppError('Payment amounts must be non-negative numbers', 400);
      return {
        method,
        amount: round2(amount),
        reference: cleanString(p.reference, 100),
        provider: cleanString(p.provider, 30).toLowerCase(),
        intentId: p.intentId ? optionalId(p.intentId, 'payment intent id') : null,
      };
    }).filter((p) => p.amount > 0 || p.method === 'insurance');
    if (payments.filter((p) => p.method === 'insurance').length > 1) {
      throw new AppError('Only one insurance payment line is allowed', 400);
    }
    if (payments.length === 0) throw new AppError('At least one payment with an amount is required', 400);
  } else {
    legacyMethod = payload.paymentMethod === undefined ? 'cash' : payload.paymentMethod;
    if (!PAYMENT_METHODS.includes(legacyMethod)) throw new AppError('Invalid payment method', 400);
    if (legacyMethod === 'insurance') {
      throw new AppError('Insurance sales need a payments line with the scheme and member', 400);
    }
  }

  let amountTendered = null;
  if (payload.amountTendered !== undefined && payload.amountTendered !== null && payload.amountTendered !== '') {
    amountTendered = Number(payload.amountTendered);
    if (!Number.isFinite(amountTendered) || amountTendered < 0) {
      throw new AppError('Amount tendered must be a non-negative number', 400);
    }
  }

  const methods = payments ? payments.map((p) => p.method) : [legacyMethod];
  if (offline && methods.includes('insurance')) {
    throw codedError('Insurance sales cannot be made offline', 400, 'OFFLINE_INSURANCE_NOT_ALLOWED');
  }
  if (offline && methods.some((m) => !OFFLINE_METHODS.includes(m))) {
    throw codedError('Offline sales can only be paid in cash or by card', 400, 'OFFLINE_PAYMENT_NOT_ALLOWED');
  }

  const offlineId = cleanString(payload.offlineId, 100);

  return {
    lines,
    discount: round2(discount),
    payments,
    legacyMethod,
    amountTendered,
    customerId: optionalId(payload.customerId, 'customer id'),
    patientId: optionalId(payload.patientId, 'patient id'),
    prescriptionId: optionalId(payload.prescriptionId, 'prescription id'),
    customer: {
      name: cleanString(payload.customer?.name, 200),
      phone: cleanString(payload.customer?.phone, 30),
    },
    prescription: {
      number: cleanString(payload.prescription?.number, 100),
      prescriber: cleanString(payload.prescription?.prescriber, 200),
      notes: cleanString(payload.prescription?.notes, 500),
    },
    notes: cleanString(payload.notes, 1000),
    clinicalAck: payload.clinicalAck === true,
    clientTotal: (() => {
      if (payload.clientTotal === undefined || payload.clientTotal === null || payload.clientTotal === '') return null;
      const n = Number(payload.clientTotal);
      return Number.isFinite(n) && n >= 0 ? round2(n) : null;
    })(),
    offlineId: offlineId || null,
    offlineCreatedAt: (() => {
      if (!payload.createdAtClient) return null;
      const d = new Date(payload.createdAtClient);
      return Number.isNaN(d.getTime()) ? null : d;
    })(),
  };
};

// Unit sold for a line: the base unit, or one of the medicine's pack units (by name).
const resolveUnit = (medicine, unitName) => {
  const baseName = medicine.baseUnit || 'unit';
  const wanted = (unitName || '').toLowerCase();
  if (!wanted || wanted === baseName.toLowerCase() || wanted === 'unit') {
    return { name: baseName, factor: 1, price: round2(medicine.price) };
  }
  const pack = (medicine.packUnits || []).find((p) => String(p.name).toLowerCase() === wanted);
  if (!pack) throw new AppError(`"${medicine.name}" has no unit "${unitName}"`, 400);
  const factor = Number(pack.factor) || 1;
  const price = pack.price !== null && pack.price !== undefined ? Number(pack.price) : round2(medicine.price * factor);
  return { name: pack.name, factor, price: round2(price) };
};

// Splits `total` over parts proportionally to `weights` (2-decimal rounding, last part gets the rest).
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

// ---------- Payments ----------

// Builds the stored payment lines. Every stored amount is the amount applied to the
// sale (they sum to grandTotal); extra cash becomes `change`.
const settlePayments = (input, grandTotal) => {
  let payments;
  let change = 0;
  let amountTendered = null;

  if (input.payments) {
    payments = input.payments.map((p) => ({ ...p }));
    const total = round2(payments.reduce((s, p) => s + p.amount, 0));
    const cashTotal = round2(payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0));
    if (total < grandTotal - EPS) {
      throw new AppError(
        `Payments (${total.toFixed(2)}) do not cover the total (${grandTotal.toFixed(2)})`,
        400
      );
    }
    const excess = round2(total - grandTotal);
    if (excess > EPS) {
      if (cashTotal < excess - EPS) {
        throw new AppError('Only cash payments can exceed the total (change is given in cash)', 400);
      }
      change = excess;
      amountTendered = cashTotal;
      // Reduce the cash lines (last first) by the change so the applied amounts sum to grandTotal
      let toRemove = excess;
      for (let i = payments.length - 1; i >= 0 && toRemove > EPS; i -= 1) {
        if (payments[i].method !== 'cash') continue;
        const cut = Math.min(payments[i].amount, toRemove);
        payments[i].amount = round2(payments[i].amount - cut);
        toRemove = round2(toRemove - cut);
      }
      payments = payments.filter((p) => p.amount > 0 || p.method !== 'cash');
    } else if (cashTotal > 0) {
      amountTendered = cashTotal;
    }
  } else {
    // Legacy single-method body: no reference is required (backwards compatible)
    payments = grandTotal > 0 ? [{ method: input.legacyMethod, amount: grandTotal, reference: '', provider: '', legacy: true }] : [];
    if (input.legacyMethod === 'cash') {
      if (input.amountTendered !== null) {
        if (input.amountTendered < grandTotal - EPS) {
          throw new AppError('Amount tendered is less than the total', 400);
        }
        amountTendered = round2(input.amountTendered);
        change = round2(Math.max(0, amountTendered - grandTotal));
      } else {
        amountTendered = grandTotal;
      }
    }
  }

  const creditAmount = round2(payments.filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0));
  const paidAmount = round2(grandTotal - creditAmount);
  const primary = [...payments].sort((a, b) => b.amount - a.amount)[0];

  return {
    payments,
    change,
    amountTendered,
    creditAmount,
    paidAmount,
    paymentMethod: primary ? primary.method : input.legacyMethod || 'cash',
  };
};

// Validates mobile money lines: a confirmed intent of this pharmacy (provider flow),
// or a typed reference (manual provider).
const resolveMobileMoney = async ({ pharmacyId, payments, session }) => {
  const intentsToConsume = [];
  for (const p of payments) {
    if (p.method !== 'mobile_money' || p.legacy) continue;
    if (p.intentId) {
      const intent = await PaymentIntent.findOne({ _id: p.intentId, pharmacyId }).session(session);
      if (!intent) throw new AppError('Mobile money payment not found', 400);
      if (intent.status !== 'confirmed') {
        throw codedError(`Mobile money payment is ${intent.status}, wait for confirmation`, 400, 'PAYMENT_NOT_CONFIRMED');
      }
      if (intent.saleId) throw new AppError('This mobile money payment was already used for another sale', 400);
      if (intent.amount < p.amount - EPS) {
        throw new AppError('Mobile money payment amount is lower than the amount applied', 400);
      }
      p.reference = intent.reference || intent.providerRef || p.reference;
      p.provider = intent.provider;
      intentsToConsume.push(intent._id);
    } else if (!p.reference) {
      throw new AppError('A transaction reference is required for mobile money payments', 400);
    } else if (!p.provider) {
      p.provider = 'manual';
    }
  }
  return intentsToConsume;
};

// ---------- Offline sync helpers ----------

// Bounds the client time of an offline sale: { at, flag, raw }.
//   at:   the time used for createdAt / offlineCreatedAt (null when the client sent none)
//   flag: '' | 'future' (more than 5 minutes ahead) | 'stale' (older than 7 days); flagged sales use the sync time
const boundOfflineTime = (raw, now = new Date()) => {
  if (!raw) return { at: null, flag: '', raw: null };
  const ms = raw.getTime();
  if (ms > now.getTime() + OFFLINE_MAX_FUTURE_MS) return { at: now, flag: 'future', raw };
  if (ms < now.getTime() - OFFLINE_MAX_AGE_MS) return { at: now, flag: 'stale', raw };
  // Small clock skew ahead of the server: never record a sale in the future
  return { at: ms > now.getTime() ? now : raw, flag: '', raw };
};

// Price of a line for an offline sale: the client's price when it is not below the
// medicine's cost price (per base unit), otherwise the current price.
const offlineUnit = (medicine, unit, clientUnitPrice) => {
  if (clientUnitPrice === null || clientUnitPrice === undefined) return { unit, changed: false };
  if (Math.abs(clientUnitPrice - unit.price) < EPS) return { unit, changed: false };
  const cost = Number(medicine.costPrice) || 0;
  const accepted = clientUnitPrice > 0 && clientUnitPrice / unit.factor >= cost - EPS;
  return { unit: accepted ? { ...unit, price: clientUnitPrice } : unit, changed: true };
};

// ---------- Core ----------

const runSale = async (ctx, input, session, { offline }) => {
  const { pharmacyId, user, membershipRole, pharmacy } = ctx;
  const now = new Date();
  const clientTime = offline ? boundOfflineTime(input.offlineCreatedAt, now) : { at: null, flag: '', raw: null };

  // Shift: sales are attached to the seller's open shift (required when the pharmacy says so).
  // Offline sales go to the shift that was open when they were made, if there is one.
  let shift = null;
  if (offline && clientTime.at && !clientTime.flag) {
    shift = await Shift.findOne({
      pharmacyId,
      userId: user._id,
      openedAt: { $lte: clientTime.at },
      $or: [{ status: 'open' }, { closedAt: { $gte: clientTime.at } }],
    })
      .sort({ openedAt: -1 })
      .select('_id')
      .session(session);
  }
  if (!shift) {
    shift = await Shift.findOne({ pharmacyId, userId: user._id, status: 'open' })
      .select('_id')
      .session(session);
  }
  // Offline sales already happened (goods handed over): accepted without a shift.
  if (!shift && shiftRequired(pharmacy) && !offline) {
    throw codedError('Open a shift before making sales', 400, 'SHIFT_REQUIRED');
  }

  // Medicines
  const uniqueIds = [...new Set(input.lines.map((l) => l.medicineId))];
  const medicines = await Medicine.find({ _id: { $in: uniqueIds }, pharmacyId }).session(session);
  if (medicines.length !== uniqueIds.length) {
    throw new AppError('Medicine not found in your catalog', 404);
  }
  const archived = medicines.filter((m) => m.isArchived);
  if (archived.length > 0) {
    throw new AppError(`Medicine is archived: ${archived.map((m) => m.name).join(', ')}`, 400);
  }
  const medById = new Map(medicines.map((m) => [m._id.toString(), m]));

  // Prescription-only medicines: a prescription record or the legacy number + prescriber
  const rxMeds = medicines.filter((m) => m.requiresPrescription);
  const hasLegacyRx = Boolean(input.prescription.number && input.prescription.prescriber);
  if (rxMeds.length > 0 && !hasLegacyRx && !input.prescriptionId) {
    throw new AppError(
      `Prescription number and prescriber are required for: ${rxMeds.map((m) => m.name).join(', ')}`,
      400
    );
  }

  // Controlled medicines: checked again (and registered) by services/clinical after stock writes
  const controlled = medicines.filter((m) => m.isControlled);
  if (controlled.length > 0) {
    const names = controlled.map((m) => m.name).join(', ');
    if (offline) {
      throw codedError(`Controlled medicines cannot be sold offline: ${names}`, 400, 'OFFLINE_CONTROLLED');
    }
    if (!can(membershipRole, 'controlled:dispense')) {
      throw new AppError('Only a pharmacist or owner can dispense controlled medicines', 403);
    }
    if (!input.patientId || !input.prescriptionId) {
      throw new AppError(`A patient and a prescription are required to dispense controlled medicine(s): ${names}`, 400);
    }
  }

  // Allergy / interaction gate: with a patient, severe warnings must be acknowledged
  // (the POS sends clinicalAck after the pharmacist confirmed). Not applied to offline sync.
  let clinicalAcknowledged = false;
  if (!offline && input.patientId) {
    const { interactions, allergyHits } = await checkSaleClinical({
      pharmacyId,
      patientId: input.patientId,
      medicineIds: uniqueIds,
    });
    const severe = allergyHits.length > 0 || interactions.some((i) => SEVERE_INTERACTIONS.includes(i.severity));
    if (severe) {
      if (!input.clinicalAck) {
        throw codedError(
          'This sale has allergy or major interaction warnings for the patient. Review and acknowledge them first.',
          409,
          'CLINICAL_ACK_REQUIRED'
        );
      }
      clinicalAcknowledged = true;
    }
  }

  // Pricing per line (pack units: price per pack, stock in base units)
  let offlinePriceAdjusted = false;
  const priced = input.lines.map((l) => {
    const medicine = medById.get(l.medicineId);
    let unit = resolveUnit(medicine, l.unitName);
    if (offline) {
      const off = offlineUnit(medicine, unit, l.clientUnitPrice);
      unit = off.unit;
      if (off.changed) offlinePriceAdjusted = true;
    }
    return {
      ...l,
      medicine,
      unit,
      baseQuantity: l.quantity * unit.factor,
      lineTotal: round2(l.quantity * unit.price),
    };
  });
  const subtotal = round2(priced.reduce((s, l) => s + l.lineTotal, 0));

  if (input.discount > subtotal + EPS) {
    throw new AppError('Discount cannot exceed subtotal', 400);
  }
  const maxPct = Number(pharmacy?.settings?.maxDiscountPercent);
  if (Number.isFinite(maxPct) && maxPct < 100 && input.discount > round2((subtotal * maxPct) / 100) + EPS) {
    throw new AppError(`Discount cannot exceed ${maxPct}% of the subtotal`, 400);
  }

  // Tax on the discounted line totals (discount spread proportionally)
  const { inclusive } = getTaxSettings(pharmacy);
  const totalsFor = (discount) => {
    const shares = splitAmount(discount, priced.map((l) => l.lineTotal));
    const tax = computeTax({
      pharmacy,
      lines: priced.map((l, i) => ({ medicine: l.medicine, lineTotal: round2(l.lineTotal - shares[i]) })),
    });
    return {
      ...tax,
      discount,
      discountShares: shares,
      grandTotal: round2(Math.max(0, subtotal - discount + (inclusive ? 0 : tax.taxTotal))),
    };
  };
  let totals = totalsFor(input.discount);

  // Offline sync: the money was already collected. When the server total is higher than what
  // the client charged (price or tax changes), the difference is absorbed as a discount.
  if (offline && input.payments) {
    const paid = round2(input.payments.reduce((s, p) => s + (p.method === 'insurance' ? 0 : p.amount), 0));
    const target = input.clientTotal !== null ? Math.min(paid, input.clientTotal) : paid;
    for (let i = 0; i < 4; i += 1) {
      const short = round2(totals.grandTotal - target);
      if (short <= EPS || totals.discount >= subtotal) break;
      const slope = totals.grandTotal - totalsFor(Math.min(subtotal, totals.discount + 1)).grandTotal;
      if (!(slope > 0)) break;
      totals = totalsFor(Math.min(subtotal, round2(totals.discount + Math.ceil((short / slope) * 100) / 100)));
      offlinePriceAdjusted = true;
    }
  }
  const { discountShares, taxLines, taxTotal, lineTaxes, grandTotal } = totals;

  // Insurance: insurer share computed from the scheme rules (client amounts are never trusted)
  let insurance = null;
  let lineInsurer = priced.map(() => 0);
  const insuranceLine = input.payments ? input.payments.find((p) => p.method === 'insurance') : null;
  if (insuranceLine) {
    if (offline) throw codedError('Insurance sales cannot be made offline', 400, 'OFFLINE_INSURANCE_NOT_ALLOWED');
    if (!can(membershipRole, 'insurance:view')) {
      throw new AppError('You are not allowed to make insurance sales', 403);
    }
    const { scheme, member } = await resolveInsuranceForSale(
      {
        pharmacyId,
        schemeId: insuranceLine.schemeId,
        memberId: insuranceLine.memberId,
        memberNo: insuranceLine.memberNo,
        date: now,
      },
      { session }
    );
    const split = computeInsuranceSplit({
      scheme,
      grandTotal,
      lines: priced.map((l, i) => ({
        medicine: l.medicine,
        gross: round2(l.lineTotal - discountShares[i] + (inclusive ? 0 : lineTaxes[i] || 0)),
      })),
    });
    if (split.insurerAmount <= EPS) {
      throw codedError(`No item in this sale is covered by "${scheme.name}"`, 400, 'INSURANCE_NOT_COVERED');
    }
    insuranceLine.amount = split.insurerAmount;
    insuranceLine.schemeId = scheme._id;
    insuranceLine.memberId = member._id;
    insuranceLine.memberNo = member.memberNo;
    lineInsurer = split.lineInsurer;
    insurance = {
      schemeId: scheme._id,
      schemeName: scheme.name,
      memberId: member._id,
      memberNo: member.memberNo,
      memberName: member.name,
      coveragePercent: split.coveragePercent,
      copayType: scheme.copayType || 'none',
      copayValue: Number(scheme.copayValue) || 0,
      eligibleAmount: split.eligibleAmount,
      copayAmount: split.copayAmount,
      insurerAmount: split.insurerAmount,
      patientAmount: split.patientAmount,
      claimId: null,
    };
  }

  // Payments
  const settled = settlePayments(input, grandTotal);
  const intentIds = await resolveMobileMoney({ pharmacyId, payments: settled.payments, session });

  if (settled.creditAmount > 0) {
    if (offline) throw codedError('Credit sales cannot be made offline', 400, 'OFFLINE_PAYMENT_NOT_ALLOWED');
    if (!can(membershipRole, 'credit:sell')) {
      throw new AppError('You are not allowed to sell on credit', 403);
    }
    if (!input.customerId) throw new AppError('Select a customer to sell on credit', 400);
    await assertCreditAllowed({ pharmacyId, customerId: input.customerId, amount: settled.creditAmount }, { session });
  }

  let customerSnapshot = { name: input.customer.name || 'Walk-in Customer', phone: input.customer.phone };
  if (input.customerId) {
    const Customer = mongoose.model('Customer');
    const cust = await Customer.findOne({ _id: input.customerId, pharmacyId }).select('name phone active').session(session);
    if (!cust) throw new AppError('Customer not found', 404);
    customerSnapshot = { name: cust.name, phone: cust.phone || input.customer.phone || '' };
  }

  // ---- Writes start here ----
  const saleItems = [];
  const movements = [];

  for (let li = 0; li < priced.length; li += 1) {
    const line = priced[li];
    const { medicine, unit } = line;

    const batches = await StockBatch.find({
      pharmacyId,
      medicineId: medicine._id,
      status: 'active',
      quantity: { $gt: 0 },
      expiryDate: { $gt: now },
    })
      .sort({ expiryDate: 1 })
      .session(session);

    const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < line.baseQuantity) {
      throw codedError(
        `Insufficient stock for "${medicine.name}". Requested: ${line.baseQuantity}, Available: ${totalAvailable}`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }

    const takes = [];
    let remaining = line.baseQuantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);

      // Atomic conditional decrement: never oversell under concurrency
      const updated = await StockBatch.findOneAndUpdate(
        { _id: batch._id, quantity: { $gte: take } },
        { $inc: { quantity: -take } },
        { returnDocument: 'after', session }
      );
      if (!updated) {
        throw codedError('Stock changed while processing the sale, please retry', 409, 'STOCK_CONFLICT');
      }
      if (updated.quantity === 0) {
        await StockBatch.updateOne(
          { _id: updated._id, quantity: 0, status: 'active' },
          { $set: { status: 'depleted' } },
          { session }
        );
      }
      takes.push({ batch, take, balanceAfter: updated.quantity });
      remaining -= take;
    }

    const subtotals = splitAmount(line.lineTotal, takes.map((t) => t.take));
    const taxes = splitAmount(lineTaxes[li] || 0, takes.map((t) => t.take));
    const insured = splitAmount(lineInsurer[li] || 0, takes.map((t) => t.take));
    const unitPrice = round2(unit.price / unit.factor);

    takes.forEach((t, i) => {
      saleItems.push({
        medicineId: medicine._id,
        name: medicine.name,
        batchId: t.batch._id,
        batchNo: t.batch.batchNo,
        quantity: t.take,
        unitPrice,
        subtotal: subtotals[i],
        unitName: unit.name,
        unitFactor: unit.factor,
        taxAmount: taxes[i],
        insuranceAmount: insured[i],
        costPrice: Number.isFinite(Number(t.batch.purchasePrice)) ? round2(t.batch.purchasePrice) : undefined,
      });
      movements.push({
        pharmacyId,
        batchId: t.batch._id,
        medicineId: medicine._id,
        type: 'sale',
        quantityChange: -t.take,
        balanceAfter: t.balanceAfter,
        userId: user._id,
      });
    });
  }

  const seq = await nextSequence(pharmacyId, 'invoice', { session });
  const invoiceNumber = formatSequence('INV', seq);

  const balanceDue = settled.creditAmount;
  const saleDoc = {
    pharmacyId,
    pharmacistId: user._id,
    staffId: user._id,
    shiftId: shift ? shift._id : null,
    customerId: input.customerId,
    patientId: input.patientId,
    prescriptionId: input.prescriptionId,
    invoiceNumber,
    customer: customerSnapshot,
    items: saleItems,
    subtotal,
    discount: totals.discount,
    tax: taxTotal,
    taxLines,
    grandTotal,
    paymentMethod: settled.paymentMethod,
    payments: settled.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference || '',
      provider: p.provider || '',
      // Insurance: receivable from the insurer until the claim is paid
      status: p.method === 'insurance' ? 'pending' : 'completed',
      intentId: p.intentId || null,
      ...(p.method === 'insurance' ? { schemeId: p.schemeId, memberId: p.memberId, memberNo: p.memberNo } : {}),
    })),
    amountPaid: settled.paidAmount,
    balanceDue,
    paymentStatus: balanceDue <= EPS ? 'paid' : settled.paidAmount > EPS ? 'partial' : 'pending',
    amountTendered: settled.amountTendered === null ? undefined : settled.amountTendered,
    change: settled.change,
    notes: input.notes,
    offlineCreatedAt: offline ? clientTime.at : input.offlineCreatedAt,
  };
  if (offline && clientTime.at) saleDoc.createdAt = clientTime.at; // reports group by createdAt
  if (clientTime.flag) {
    saleDoc.offlineTimeFlag = clientTime.flag;
    saleDoc.offlineClientCreatedAt = clientTime.raw;
  }
  if (offlinePriceAdjusted) saleDoc.offlinePriceAdjusted = true;
  if (clinicalAcknowledged) saleDoc.clinicalAcknowledged = true;
  if (input.offlineId) saleDoc.offlineId = input.offlineId;
  if (insurance) saleDoc.insurance = insurance;
  if (input.prescription.number || input.prescription.prescriber) {
    saleDoc.prescription = input.prescription;
  }

  const [sale] = await Sale.create([saleDoc], { session });

  for (const m of movements) {
    await recordMovement({ ...m, refId: sale._id, refModel: 'Sale' }, { session });
  }

  if (settled.creditAmount > 0) {
    await applyCreditSale(
      { pharmacyId, customerId: input.customerId, saleId: sale._id, amount: settled.creditAmount },
      { session }
    );
  }

  if (intentIds.length > 0) {
    const res = await PaymentIntent.updateMany(
      { _id: { $in: intentIds }, pharmacyId, status: 'confirmed', saleId: null },
      { $set: { saleId: sale._id } },
      { session }
    );
    if (res.modifiedCount !== intentIds.length) {
      throw new AppError('This mobile money payment was already used for another sale', 409);
    }
  }

  // Clinical: controlled register (throws when patient/prescription are missing or invalid)
  if (controlled.length > 0) {
    await recordControlledDispenses(
      {
        pharmacyId,
        sale,
        patientId: input.patientId,
        prescriptionId: input.prescriptionId,
        userId: user._id,
        role: membershipRole,
      },
      { session }
    );
  }
  if (input.prescriptionId) {
    await recordPrescriptionDispense({ pharmacyId, prescriptionId: input.prescriptionId, sale }, { session });
  }

  // Fiscal e-invoicing: queue a 'pending' record in the same transaction when the
  // pharmacy has e-invoicing enabled (no-op otherwise). Submission stays explicit.
  await require('./einvoice').queueForSale(sale, { session });

  return sale;
};

const findByOfflineId = (pharmacyId, offlineId) => Sale.findOne({ pharmacyId, offlineId });

const isDuplicateOfflineId = (err) =>
  err && err.code === 11000 && /offlineId/.test(`${JSON.stringify(err.keyPattern || {})} ${err.message || ''}`);

const processSale = async (ctx, payload, { session, offline = false } = {}) => {
  if (!ctx || !ctx.pharmacyId || !ctx.user) throw new AppError('Invalid sale context', 500);
  const input = normalizePayload(payload, { offline });

  if (input.offlineId) {
    const existing = await findByOfflineId(ctx.pharmacyId, input.offlineId);
    if (existing) return { sale: existing, duplicate: true };
  }

  if (session) {
    const sale = await runSale(ctx, input, session, { offline });
    return { sale, duplicate: false };
  }

  const own = await mongoose.startSession();
  try {
    let sale;
    await own.withTransaction(async () => {
      sale = await runSale(ctx, input, own, { offline });
    });
    return { sale, duplicate: false };
  } catch (err) {
    // Two syncs of the same offline sale raced: return the one that won
    if (input.offlineId && isDuplicateOfflineId(err)) {
      const existing = await findByOfflineId(ctx.pharmacyId, input.offlineId);
      if (existing) return { sale: existing, duplicate: true };
    }
    throw err;
  } finally {
    await own.endSession();
  }
};

// Builds the ctx from an Express request (after protect + pharmacyScope).
const contextFromRequest = (req) => ({
  pharmacyId: req.pharmacyId,
  user: req.user,
  membershipRole: req.membershipRole,
  pharmacy: req.pharmacy,
  timezone: req.headers && req.headers['x-timezone'],
  req,
});

module.exports = {
  processSale,
  contextFromRequest,
  normalizePayload,
  settlePayments,
  resolveUnit,
  shiftRequired,
  boundOfflineTime,
  PAYMENT_METHODS,
  OFFLINE_METHODS,
};
