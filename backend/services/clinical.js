// Clinical services (#16 prescriptions, #17 controlled register, #18 interactions & allergies).
// Owner: Clinical agent. The POS agent (Wave 3) calls these from the sale flow:
//
//   checkSaleClinical({ pharmacyId, patientId, medicineIds })
//     -> { interactions: [{ a, b, aMedicineId, bMedicineId, substanceA, substanceB, severity, description, source }],
//          allergyHits: [{ medicineId, medicineName, allergy: { substance, reaction, severity }, matchedOn }] }
//
//   recordControlledDispenses({ pharmacyId, sale, patientId, prescriptionId, userId, role? }, { session })
//     Call AFTER the stock of the sale has been decremented (inside the same transaction).
//     For each sale item whose medicine isControlled: requires patientId + prescriptionId (AppError 400),
//     the patient and an active, unexpired prescription of that patient in this pharmacy (AppError 400),
//     and that the prescription lists the medicine when it has items (AppError 400).
//     If `role` (membership role) is passed it must have 'controlled:dispense' (AppError 403).
//     Writes one ControlledEntry per sale item with the running balance. Returns the entries ([] if none).
//
//   recordPrescriptionDispense({ pharmacyId, prescriptionId, sale }, { session })
//     Optional: updates quantityDispensed / refillsUsed / lastDispensedAt / status of the prescription.
//
//   recordControlledReceipt({ pharmacyId, medicineId, batchId, quantity, userId, refId }, { session })
//   recordControlledMovement({ pharmacyId, medicineId, entryType, quantityIn, quantityOut, ... }, { session })
//     Register stock coming in (receipts, returns, adjustments). No-op (returns null) for non-controlled medicines.

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { can } = require('../config/permissions');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const ControlledEntry = require('../models/ControlledEntry');
const InteractionRule = require('../models/InteractionRule');

const SEVERITY_ORDER = { contraindicated: 4, major: 3, moderate: 2, minor: 1 };

// ---------- Text helpers ----------

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// True when `term` appears as whole word(s) inside `text` (both normalized).
const containsWords = (text, term) => {
  if (!text || !term) return false;
  return ` ${text} `.includes(` ${term} `);
};

// Substances of a medicine: genericName split on , + / ; & "and", plus the brand name.
const substancesOf = (medicine) => {
  const parts = String(medicine.genericName || '')
    .split(/[,+/;&]|\band\b/i)
    .map(normalize)
    .filter(Boolean);
  const name = normalize(medicine.name);
  if (name) parts.push(name);
  return [...new Set(parts)];
};

const medicineMatches = (subs, term) => subs.some((s) => containsWords(s, term));

// ---------- Built-in starter rules ----------

let builtIn = null;
const loadBuiltIn = () => {
  if (builtIn) return builtIn;
  const file = path.join(__dirname, '..', 'data', 'interactionRules.json');
  let raw = { rules: [], allergyGroups: {} };
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('[clinical] cannot load interaction rules:', err.message);
  }
  const rules = (raw.rules || []).map((r, i) => {
    const [a, b] = [normalize(r.substanceA), normalize(r.substanceB)].sort();
    return {
      _id: `global-${i + 1}`,
      pharmacyId: null,
      substanceA: a,
      substanceB: b,
      severity: r.severity,
      description: r.description || '',
      global: true,
      builtIn: true,
    };
  });
  const allergyGroups = {};
  Object.entries(raw.allergyGroups || {}).forEach(([k, v]) => {
    allergyGroups[normalize(k)] = (v || []).map(normalize);
  });
  builtIn = { notice: raw._notice || '', rules, allergyGroups };
  return builtIn;
};

// Global rules (built-in + DB rows with pharmacyId null) followed by pharmacy rules.
const getRules = async (pharmacyId) => {
  const { rules } = loadBuiltIn();
  const dbRules = await InteractionRule.find({ pharmacyId: { $in: [null, pharmacyId] } }).lean();
  const globalDb = dbRules.filter((r) => !r.pharmacyId).map((r) => ({ ...r, global: true }));
  const custom = dbRules.filter((r) => r.pharmacyId).map((r) => ({ ...r, global: false }));
  return { global: [...rules, ...globalDb], custom };
};

// ---------- #18 Interaction & allergy check ----------

const toObjectIds = (ids) =>
  [...new Set((Array.isArray(ids) ? ids : []).map(String))]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

const checkSaleClinical = async ({ pharmacyId, patientId, medicineIds }) => {
  const ids = toObjectIds(medicineIds);
  const medicines = ids.length
    ? await Medicine.find({ _id: { $in: ids }, pharmacyId }).select('name genericName').lean()
    : [];
  const meds = medicines.map((m) => ({ ...m, subs: substancesOf(m) }));

  // Interactions between different medicines in the cart
  const interactions = [];
  if (meds.length > 1) {
    const { global, custom } = await getRules(pharmacyId);
    // A pharmacy rule for the same pair overrides the global one
    const byPair = new Map();
    [...global, ...custom].forEach((r) => byPair.set(`${r.substanceA}|${r.substanceB}`, r));
    const rules = [...byPair.values()];

    for (let i = 0; i < meds.length; i += 1) {
      for (let j = i + 1; j < meds.length; j += 1) {
        const x = meds[i];
        const y = meds[j];
        rules.forEach((r) => {
          const forward = medicineMatches(x.subs, r.substanceA) && medicineMatches(y.subs, r.substanceB);
          const backward = medicineMatches(x.subs, r.substanceB) && medicineMatches(y.subs, r.substanceA);
          if (!forward && !backward) return;
          const [first, second] = forward ? [x, y] : [y, x];
          interactions.push({
            a: first.name,
            b: second.name,
            aMedicineId: first._id,
            bMedicineId: second._id,
            substanceA: r.substanceA,
            substanceB: r.substanceB,
            severity: r.severity,
            description: r.description,
            source: r.global ? 'global' : 'pharmacy',
          });
        });
      }
    }
    interactions.sort((p, q) => (SEVERITY_ORDER[q.severity] || 0) - (SEVERITY_ORDER[p.severity] || 0));
  }

  // Allergy hits for the selected patient
  const allergyHits = [];
  if (patientId) {
    // patientId may come straight from a request body: only a plain id string / ObjectId is
    // accepted and it is cast before it reaches the filter (no operator objects or arrays).
    const rawId = patientId instanceof mongoose.Types.ObjectId ? patientId.toString() : patientId;
    if (typeof rawId !== 'string' || !mongoose.isValidObjectId(rawId)) throw new AppError('Invalid patient id', 400);
    const patientObjectId = new mongoose.Types.ObjectId(rawId);
    const patient = await Patient.findOne({ _id: patientObjectId, pharmacyId }).select('allergies').lean();
    if (!patient) throw new AppError('Patient not found', 404);
    const { allergyGroups } = loadBuiltIn();
    (patient.allergies || []).forEach((allergy) => {
      const substance = normalize(allergy.substance);
      if (!substance) return;
      const singular = substance.endsWith('s') ? substance.slice(0, -1) : substance;
      const terms = [
        ...new Set([substance, singular, ...(allergyGroups[substance] || []), ...(allergyGroups[singular] || [])]),
      ];
      meds.forEach((m) => {
        const term = terms.find((t) => medicineMatches(m.subs, t));
        if (!term) return;
        allergyHits.push({
          medicineId: m._id,
          medicineName: m.name,
          allergy: { substance: allergy.substance, reaction: allergy.reaction, severity: allergy.severity },
          matchedOn: term,
        });
      });
    });
  }

  return { interactions, allergyHits };
};

// ---------- #17 Controlled register ----------

// Sellable + expired stock left of a medicine (base units).
const currentStock = async (pharmacyId, medicineId, { session } = {}) => {
  const agg = StockBatch.aggregate([
    {
      $match: {
        pharmacyId: new mongoose.Types.ObjectId(String(pharmacyId)),
        medicineId: new mongoose.Types.ObjectId(String(medicineId)),
        status: { $in: ['active', 'expired'] },
        quantity: { $gt: 0 },
      },
    },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]);
  if (session) agg.session(session);
  const [row] = await agg;
  return row ? row.total : 0;
};

const isPrescriptionUsable = (rx, now = new Date()) =>
  rx.status === 'active' && (!rx.expiryDate || new Date(rx.expiryDate) >= now);

// Does the prescription list this medicine (by id, or by name/generic name)?
const prescriptionCovers = (rx, medicine) => {
  if (!rx.items || rx.items.length === 0) return true;
  const subs = substancesOf(medicine);
  return rx.items.some((it) => {
    if (it.medicineId && String(it.medicineId) === String(medicine._id)) return true;
    const n = normalize(it.name);
    return n && (medicineMatches(subs, n) || subs.some((s) => containsWords(n, s)));
  });
};

const recordControlledDispenses = async (
  { pharmacyId, sale, patientId, prescriptionId, userId, role },
  { session } = {}
) => {
  if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) return [];
  const medIds = toObjectIds(sale.items.map((it) => it.medicineId));
  const controlledMeds = await Medicine.find({ _id: { $in: medIds }, pharmacyId, isControlled: true })
    .select('name genericName controlledSchedule')
    .session(session || null)
    .lean();
  if (controlledMeds.length === 0) return [];

  if (role !== undefined && !can(role, 'controlled:dispense')) {
    throw new AppError('Only a pharmacist or owner can dispense controlled medicines', 403);
  }

  const pId = patientId || sale.patientId;
  const rxId = prescriptionId || sale.prescriptionId;
  const names = controlledMeds.map((m) => m.name).join(', ');
  if (!pId || !rxId) {
    throw new AppError(`A patient and a prescription are required to dispense controlled medicine(s): ${names}`, 400);
  }
  if (!mongoose.isValidObjectId(String(pId)) || !mongoose.isValidObjectId(String(rxId))) {
    throw new AppError('Invalid patient or prescription id', 400);
  }

  const [patient, rx] = await Promise.all([
    Patient.findOne({ _id: pId, pharmacyId }).select('_id').session(session || null).lean(),
    Prescription.findOne({ _id: rxId, pharmacyId }).session(session || null).lean(),
  ]);
  if (!patient) throw new AppError('Patient not found for controlled dispense', 400);
  if (!rx) throw new AppError('Prescription not found for controlled dispense', 400);
  if (String(rx.patientId) !== String(patient._id)) {
    throw new AppError('The prescription does not belong to this patient', 400);
  }
  if (!isPrescriptionUsable(rx)) {
    throw new AppError(`Prescription ${rx.number} is ${rx.status === 'active' ? 'expired' : rx.status}`, 400);
  }
  const notCovered = controlledMeds.filter((m) => !prescriptionCovers(rx, m));
  if (notCovered.length) {
    throw new AppError(
      `Prescription ${rx.number} does not include controlled medicine(s): ${notCovered.map((m) => m.name).join(', ')}`,
      400
    );
  }

  const controlledById = new Map(controlledMeds.map((m) => [String(m._id), m]));
  const date = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const actor = userId || sale.staffId || sale.pharmacistId || null;

  // Stock was already decremented: the balance after the last item of a medicine is
  // the current stock; earlier items of the same medicine get the later quantities added back.
  const docs = [];
  const byMedicine = new Map();
  sale.items.forEach((it) => {
    const key = String(it.medicineId);
    if (!controlledById.has(key)) return;
    if (!byMedicine.has(key)) byMedicine.set(key, []);
    byMedicine.get(key).push(it);
  });
  for (const [medId, items] of byMedicine) {
    const stockNow = await currentStock(pharmacyId, medId, { session });
    let remainingAfter = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
    items.forEach((it) => {
      remainingAfter -= Number(it.quantity || 0);
      docs.push({
        pharmacyId,
        medicineId: it.medicineId,
        batchId: it.batchId || null,
        saleId: sale._id || null,
        patientId: patient._id,
        prescriptionId: rx._id,
        prescriptionNumber: rx.externalNumber || rx.number,
        prescriberName: rx.prescriberName,
        quantityOut: Number(it.quantity || 0),
        quantityIn: 0,
        balanceAfter: stockNow + remainingAfter,
        userId: actor,
        entryType: 'dispense',
        date,
      });
    });
  }
  return ControlledEntry.insertMany(docs, { session: session || undefined });
};

// Generic register entry for stock coming in or corrections. No-op for non-controlled medicines.
const recordControlledMovement = async (
  {
    pharmacyId, medicineId, batchId = null, entryType, quantityIn = 0, quantityOut = 0,
    userId = null, refId = null, saleId = null, patientId = null, prescriptionId = null, notes = '', date,
  },
  { session } = {}
) => {
  if (!['receive', 'return', 'adjust', 'dispense'].includes(entryType)) {
    throw new AppError('Invalid controlled register entry type', 400);
  }
  const medicine = await Medicine.findOne({ _id: medicineId, pharmacyId, isControlled: true })
    .select('_id')
    .session(session || null)
    .lean();
  if (!medicine) return null;
  const balanceAfter = await currentStock(pharmacyId, medicineId, { session });
  const [entry] = await ControlledEntry.insertMany(
    [{
      pharmacyId, medicineId, batchId, saleId, patientId, prescriptionId,
      quantityIn: Math.max(0, Number(quantityIn) || 0),
      quantityOut: Math.max(0, Number(quantityOut) || 0),
      balanceAfter, userId, entryType, refId, notes, date: date || new Date(),
    }],
    { session: session || undefined }
  );
  return entry;
};

// Call AFTER the batch quantity has been added (same transaction).
const recordControlledReceipt = async ({ pharmacyId, medicineId, batchId, quantity, userId, refId }, { session } = {}) =>
  recordControlledMovement(
    { pharmacyId, medicineId, batchId, entryType: 'receive', quantityIn: quantity, userId, refId },
    { session }
  );

// ---------- #16 Prescription dispensing ----------

// Updates prescription item counters from a sale. Quantities are base units.
// A fill = quantityPrescribed; refillsUsed = fills started beyond the first.
// Throws AppError 400 when the prescription is not usable or the quantity
// exceeds quantityPrescribed * (1 + refillsAllowed).
const recordPrescriptionDispense = async ({ pharmacyId, prescriptionId, sale }, { session } = {}) => {
  if (!prescriptionId || !sale) return null;
  const rx = await Prescription.findOne({ _id: prescriptionId, pharmacyId }).session(session || null);
  if (!rx) throw new AppError('Prescription not found', 400);
  if (!isPrescriptionUsable(rx)) throw new AppError(`Prescription ${rx.number} is not active`, 400);

  const date = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const qtyByMed = new Map();
  const medIds = toObjectIds((sale.items || []).map((it) => it.medicineId));
  const medicines = await Medicine.find({ _id: { $in: medIds }, pharmacyId })
    .select('name genericName')
    .session(session || null)
    .lean();
  (sale.items || []).forEach((it) => {
    const k = String(it.medicineId);
    qtyByMed.set(k, (qtyByMed.get(k) || 0) + Number(it.quantity || 0));
  });

  medicines.forEach((m) => {
    const qty = qtyByMed.get(String(m._id)) || 0;
    const subs = substancesOf(m);
    const item = rx.items.find((it) => (it.medicineId && String(it.medicineId) === String(m._id)))
      || rx.items.find((it) => {
        const n = normalize(it.name);
        return n && (medicineMatches(subs, n) || subs.some((s) => containsWords(n, s)));
      });
    if (!item || qty <= 0) return;
    if (!item.medicineId) item.medicineId = m._id;
    const newTotal = item.quantityDispensed + qty;
    if (item.quantityPrescribed > 0) {
      const maxTotal = item.quantityPrescribed * (1 + item.refillsAllowed);
      if (newTotal > maxTotal) {
        throw new AppError(
          `Prescription ${rx.number}: ${item.name} exceeds the prescribed quantity (${maxTotal - item.quantityDispensed} left)`,
          400
        );
      }
      item.refillsUsed = Math.max(0, Math.ceil(newTotal / item.quantityPrescribed) - 1);
    } else if (item.quantityDispensed > 0) {
      if (item.refillsUsed >= item.refillsAllowed) {
        throw new AppError(`Prescription ${rx.number}: no refills left for ${item.name}`, 400);
      }
      item.refillsUsed += 1;
    }
    item.quantityDispensed = newTotal;
    item.lastDispensedAt = date;
  });

  const quantified = rx.items.filter((it) => it.quantityPrescribed > 0);
  if (
    quantified.length > 0
    && quantified.length === rx.items.length
    && quantified.every((it) => it.quantityDispensed >= it.quantityPrescribed * (1 + it.refillsAllowed))
  ) {
    rx.status = 'completed';
  }
  await rx.save({ session: session || undefined });
  return rx;
};

// Marks active prescriptions whose expiryDate has passed as expired.
const expireStalePrescriptions = async (pharmacyId) =>
  Prescription.updateMany(
    { pharmacyId, status: 'active', expiryDate: { $ne: null, $lt: new Date() } },
    { $set: { status: 'expired' } }
  );

module.exports = {
  checkSaleClinical,
  recordControlledDispenses,
  recordControlledReceipt,
  recordControlledMovement,
  recordPrescriptionDispense,
  expireStalePrescriptions,
  currentStock,
  getRules,
  loadBuiltIn,
  normalize,
  substancesOf,
  SEVERITY_ORDER,
};
