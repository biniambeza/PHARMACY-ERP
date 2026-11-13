const mongoose = require('mongoose');
const ControlledEntry = require('../models/ControlledEntry');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const AppError = require('../utils/AppError');

const MAX_ENTRIES = 5000;

const toId = (id) => new mongoose.Types.ObjectId(String(id));

// Current register stock (active + expired batches with stock, as services/clinical currentStock)
// for many medicines in one aggregate. Returns Map(medicineId string -> units).
const stockByMedicine = async (pharmacyId, medicineIds) => {
  if (!medicineIds.length) return new Map();
  const rows = await StockBatch.aggregate([
    {
      $match: {
        pharmacyId: toId(pharmacyId),
        medicineId: { $in: medicineIds.map(toId) },
        status: { $in: ['active', 'expired'] },
        quantity: { $gt: 0 },
      },
    },
    { $group: { _id: '$medicineId', total: { $sum: '$quantity' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.total]));
};

// Last register balance before `before` for each medicine, in one aggregate.
const balancesBefore = async (pharmacyId, medicineIds, before) => {
  if (!medicineIds.length) return new Map();
  const rows = await ControlledEntry.aggregate([
    { $match: { pharmacyId: toId(pharmacyId), medicineId: { $in: medicineIds.map(toId) }, date: { $lt: before } } },
    { $sort: { medicineId: 1, date: -1, _id: -1 } },
    { $group: { _id: '$medicineId', balanceAfter: { $first: '$balanceAfter' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.balanceAfter]));
};

const parseDate = (v, label, endOfDay = false) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${label}`, 400);
  // A plain YYYY-MM-DD "to" date includes the whole day
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) d.setUTCHours(23, 59, 59, 999);
  return d;
};

// @route GET /api/controlled/medicines  -> controlled medicines with current stock
const getControlledMedicines = async (req, res) => {
  const medicines = await Medicine.find({ pharmacyId: req.pharmacyId, isControlled: true })
    .select('name genericName strength dosageForm controlledSchedule isArchived baseUnit')
    .sort({ name: 1 })
    .lean();
  const stock = await stockByMedicine(req.pharmacyId, medicines.map((m) => m._id));
  const withStock = medicines.map((m) => ({ ...m, currentStock: stock.get(String(m._id)) || 0 }));
  res.json({ success: true, medicines: withStock });
};

// @route GET /api/controlled/register?medicineId&from&to
// Register grouped per medicine with opening and closing balances for the period.
const getRegister = async (req, res) => {
  const { medicineId, from, to } = req.query;
  const fromDate = from ? parseDate(from, 'from date') : null;
  const toDate = to ? parseDate(to, 'to date', true) : null;
  if (fromDate && toDate && fromDate > toDate) throw new AppError('"from" must be before "to"', 400);

  const medQuery = { pharmacyId: req.pharmacyId };
  if (medicineId) {
    if (typeof medicineId !== 'string' || !mongoose.isValidObjectId(medicineId)) throw new AppError('Invalid medicine id', 400);
    medQuery._id = new mongoose.Types.ObjectId(medicineId);
  } else {
    // Controlled medicines plus any medicine that has register history (e.g. flag removed later)
    const withEntries = await ControlledEntry.distinct('medicineId', { pharmacyId: req.pharmacyId });
    medQuery.$or = [{ isControlled: true }, { _id: { $in: withEntries } }];
  }
  const medicines = await Medicine.find(medQuery)
    .select('name genericName strength dosageForm controlledSchedule baseUnit isControlled')
    .sort({ name: 1 })
    .lean();
  if (medicineId && medicines.length === 0) throw new AppError('Medicine not found', 404);

  const entryQuery = { pharmacyId: req.pharmacyId, medicineId: { $in: medicines.map((m) => m._id) } };
  if (fromDate || toDate) {
    entryQuery.date = {};
    if (fromDate) entryQuery.date.$gte = fromDate;
    if (toDate) entryQuery.date.$lte = toDate;
  }
  const entries = await ControlledEntry.find(entryQuery)
    .sort({ date: 1, _id: 1 })
    .limit(MAX_ENTRIES)
    .populate('patientId', 'name phone')
    .populate('userId', 'name')
    .populate('batchId', 'batchNo expiryDate')
    .populate('saleId', 'invoiceNumber')
    .lean();

  const byMed = new Map(medicines.map((m) => [String(m._id), []]));
  entries.forEach((e) => {
    const list = byMed.get(String(e.medicineId));
    if (list) list.push(e);
  });

  // Current stock and opening balances for all medicines in two aggregates (not one query per medicine).
  const medIds = medicines.map((m) => m._id);
  const [stock, priorBalances] = await Promise.all([
    stockByMedicine(req.pharmacyId, medIds),
    fromDate ? balancesBefore(req.pharmacyId, medIds, fromDate) : new Map(),
  ]);

  const groups = medicines.map((m) => {
    const list = byMed.get(String(m._id));
    let opening = priorBalances.has(String(m._id)) ? priorBalances.get(String(m._id)) : null;
    if (opening === null && list.length) {
      const first = list[0];
      opening = first.balanceAfter - (first.quantityIn || 0) + (first.quantityOut || 0);
    }
    const stockNow = stock.get(String(m._id)) || 0;
    if (opening === null) opening = stockNow;
    const totalIn = list.reduce((s, e) => s + (e.quantityIn || 0), 0);
    const totalOut = list.reduce((s, e) => s + (e.quantityOut || 0), 0);
    const closing = list.length ? list[list.length - 1].balanceAfter : opening;
    return {
      medicine: m,
      openingBalance: opening,
      totalIn,
      totalOut,
      closingBalance: closing,
      currentStock: stockNow,
      entries: list.map((e) => ({
        _id: e._id,
        date: e.date,
        entryType: e.entryType,
        quantityIn: e.quantityIn,
        quantityOut: e.quantityOut,
        balanceAfter: e.balanceAfter,
        patient: e.patientId,
        prescriptionId: e.prescriptionId,
        prescriptionNumber: e.prescriptionNumber,
        prescriberName: e.prescriberName,
        batch: e.batchId,
        sale: e.saleId,
        user: e.userId,
        notes: e.notes,
      })),
    };
  });

  res.json({
    success: true,
    from: fromDate,
    to: toDate,
    truncated: entries.length >= MAX_ENTRIES,
    pharmacy: req.pharmacy
      ? { name: req.pharmacy.name, licenseNo: req.pharmacy.licenseNo, address: req.pharmacy.address }
      : null,
    groups,
  });
};

module.exports = { getRegister, getControlledMedicines };
