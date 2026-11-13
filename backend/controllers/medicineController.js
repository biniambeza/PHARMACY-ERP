const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/PurchaseOrder');
const Sale = require('../models/Sale');
const PriceHistory = require('../models/PriceHistory');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { audit } = require('../utils/audit');
const { can } = require('../config/permissions');
const {
  cleanCode,
  normalizePackUnits,
  assertCodesAvailable,
  marginWarning,
  withMargin,
  diffPrices,
  recordPriceHistory,
  generateInternalBarcode,
  lookupByCode,
  applyPriceRule,
} = require('../services/catalog');

const MAX_PAGE_LIMIT = 200;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_BULK_PRICE_ITEMS = 5000;

// Fields a pharmacist is allowed to set on a medicine. barcode, sku and
// packUnits are validated separately.
const EDITABLE_FIELDS = [
  'name',
  'genericName',
  'category',
  'dosageForm',
  'strength',
  'price',
  'costPrice',
  'minStockLevel',
  'requiresPrescription',
  'baseUnit',
  'leadTimeDays',
  'reorderSafetyDays',
  'preferredSupplierId',
  'taxExempt',
  'isControlled',
  'controlledSchedule',
];

// Changing price / costPrice / pack prices on an existing medicine needs price:manage.
const canManagePrices = (req) => req.user?.role === 'admin' || can(req.membershipRole, 'price:manage');

// minMarginPercent: '' / null -> null, otherwise a percentage in [0, 100).
const parseMinMargin = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= 100) {
    throw new AppError('Minimum margin must be a percentage between 0 and 99.99', 400);
  }
  return n;
};

// Pagination is opt-in via `?page=`. Without it every match is returned
// (backward compatible with callers that pass only `limit`).
const parsePagination = (query) => {
  if (query.page === undefined) return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
};

// Case-insensitive exact-name match, safe against regex injection.
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i');

// Copies whitelisted fields from the request body onto `target`.
const applyEditableFields = (target, body) => {
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      target[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
    }
  }
  if (body.preferredSupplierId === '') target.preferredSupplierId = null;
  const minMargin = parseMinMargin(body.minMarginPercent);
  if (minMargin !== undefined) target.minMarginPercent = minMargin;
};

// @desc    Get all medicines for the logged-in pharmacy
// @route   GET /api/medicines
// @access  medicine:view
const getMedicines = async (req, res) => {
  const { search, category, includeArchived } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (String(includeArchived) !== 'true') {
    query.isArchived = { $ne: true };
  }

  if (category) {
    query.category = String(category);
  }

  if (search) {
    const pattern = escapeRegex(String(search));
    const code = String(search).trim();
    query.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { genericName: { $regex: pattern, $options: 'i' } },
      { barcode: code },
      { 'packUnits.barcode': code },
      { sku: code },
    ];
  }

  const pagination = parsePagination(req.query);
  let findQuery = Medicine.find(query).sort({ name: 1 });
  if (pagination) {
    findQuery = findQuery.skip(pagination.skip).limit(pagination.limit);
  }

  const [medicines, total] = await Promise.all([findQuery, Medicine.countDocuments(query)]);

  const response = {
    success: true,
    count: medicines.length,
    total,
    // Each medicine also carries computed marginPercent / marginWarning
    medicines: medicines.map(withMargin),
  };
  if (pagination) {
    response.page = pagination.page;
    response.limit = pagination.limit;
    response.pages = Math.ceil(total / pagination.limit);
  }

  return res.status(200).json(response);
};

// @desc    Get single medicine by ID
// @route   GET /api/medicines/:id
// @access  medicine:view
const getMedicineById = async (req, res) => {
  const medicine = await Medicine.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!medicine) {
    return res.status(404).json({
      success: false,
      message: 'Medicine not found in your pharmacy catalog',
    });
  }

  return res.status(200).json({
    success: true,
    medicine: withMargin(medicine),
  });
};

// @desc    Create a new medicine in the pharmacy catalog
// @route   POST /api/medicines
// @access  medicine:manage (the initial price may be set without price:manage)
const createMedicine = async (req, res) => {
  const body = req.body || {};
  const { name, category, price } = body;

  if (!name || typeof name !== 'string' || !name.trim() || !category || price === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Please provide name, category, and price',
    });
  }

  const existing = await Medicine.findOne({
    pharmacyId: req.pharmacyId,
    name: exactNameRegex(name),
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: existing.isArchived
        ? 'An archived medicine with this name already exists in your catalog'
        : 'A medicine with this name already exists in your catalog',
    });
  }

  const data = { pharmacyId: req.pharmacyId };
  applyEditableFields(data, body);
  data.name = name.trim();
  data.barcode = cleanCode(body.barcode) || undefined;
  data.sku = cleanCode(body.sku);
  data.packUnits = normalizePackUnits(body.packUnits, { baseUnit: data.baseUnit || 'unit' });

  await assertCodesAvailable({
    pharmacyId: req.pharmacyId,
    barcode: data.barcode,
    packUnits: data.packUnits,
    sku: data.sku,
  });

  const medicine = await Medicine.create(data);
  await audit(req, { action: 'medicine.create', entity: 'Medicine', entityId: medicine._id, after: medicine });

  return res.status(201).json({
    success: true,
    message: 'Medicine added successfully',
    medicine: withMargin(medicine),
  });
};

// @desc    Update a medicine. Price changes need price:manage and are recorded in PriceHistory.
// @route   PUT /api/medicines/:id   (optional body.priceChangeReason)
// @access  medicine:manage
const updateMedicine = async (req, res) => {
  const medicine = await Medicine.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!medicine) {
    return res.status(404).json({
      success: false,
      message: 'Medicine not found in your pharmacy catalog',
    });
  }

  const body = req.body || {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new AppError('Medicine name cannot be empty', 400);
    }
    const newName = body.name.trim();
    if (newName.toLowerCase() !== medicine.name.toLowerCase()) {
      const duplicate = await Medicine.findOne({
        pharmacyId: req.pharmacyId,
        _id: { $ne: medicine._id },
        name: exactNameRegex(newName),
      });
      if (duplicate) {
        throw new AppError('A medicine with this name already exists in your catalog', 409);
      }
    }
  }

  const before = medicine.toObject();

  applyEditableFields(medicine, body);
  if (body.barcode !== undefined) medicine.barcode = cleanCode(body.barcode) || undefined;
  if (body.sku !== undefined) medicine.sku = cleanCode(body.sku);
  if (body.packUnits !== undefined) {
    medicine.packUnits = normalizePackUnits(body.packUnits, { baseUnit: medicine.baseUnit });
  } else if (body.baseUnit !== undefined) {
    // The new base unit name must not clash with an existing pack name
    normalizePackUnits(before.packUnits, { baseUnit: medicine.baseUnit });
  }

  const priceRows = diffPrices(before, medicine.toObject());
  if (priceRows.length && !canManagePrices(req)) {
    throw new AppError('You do not have permission to change prices (price:manage)', 403);
  }

  if (body.barcode !== undefined || body.packUnits !== undefined || body.sku !== undefined) {
    await assertCodesAvailable({
      pharmacyId: req.pharmacyId,
      excludeId: medicine._id,
      barcode: medicine.barcode,
      packUnits: medicine.packUnits,
      sku: body.sku !== undefined ? medicine.sku : undefined,
    });
  }

  const reason = typeof body.priceChangeReason === 'string' ? body.priceChangeReason.trim().slice(0, 300) : '';
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await medicine.save({ session });
      await recordPriceHistory(
        priceRows.map((r) => ({
          ...r,
          pharmacyId: req.pharmacyId,
          medicineId: medicine._id,
          changedBy: req.user?._id,
          reason,
          source: 'edit',
        })),
        { session }
      );
      await audit(
        req,
        {
          action: priceRows.length ? 'medicine.price_change' : 'medicine.update',
          entity: 'Medicine',
          entityId: medicine._id,
          before,
          after: medicine,
          meta: priceRows.length ? { priceChanges: priceRows, reason } : undefined,
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return res.status(200).json({
    success: true,
    message: 'Medicine updated successfully',
    medicine: withMargin(medicine),
  });
};

// @desc    Delete a medicine (archives it instead if it has history)
// @route   DELETE /api/medicines/:id
// @access  medicine:manage
const deleteMedicine = async (req, res) => {
  const medicine = await Medicine.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!medicine) {
    return res.status(404).json({
      success: false,
      message: 'Medicine not found in your pharmacy catalog',
    });
  }

  const scope = { pharmacyId: req.pharmacyId };

  const [stockOnHand, openOrder] = await Promise.all([
    StockBatch.exists({ ...scope, medicineId: medicine._id, quantity: { $gt: 0 } }),
    PurchaseOrder.exists({
      ...scope,
      status: { $in: ['draft', 'ordered', 'partially_received'] },
      'items.medicineId': medicine._id,
    }),
  ]);

  if (stockOnHand) {
    throw new AppError(
      'This medicine still has stock on hand. Dispose of or adjust its stock batches before removing it.',
      409
    );
  }

  if (openOrder) {
    throw new AppError(
      'This medicine is on an open purchase order. Receive or cancel the order before removing it.',
      409
    );
  }

  const [anySale, anyOrder, anyBatch] = await Promise.all([
    Sale.exists({ ...scope, 'items.medicineId': medicine._id }),
    PurchaseOrder.exists({ ...scope, 'items.medicineId': medicine._id }),
    StockBatch.exists({ ...scope, medicineId: medicine._id }),
  ]);

  if (anySale || anyOrder || anyBatch) {
    if (!medicine.isArchived) {
      medicine.isArchived = true;
      await medicine.save();
      await audit(req, { action: 'medicine.archive', entity: 'Medicine', entityId: medicine._id });
    }
    return res.status(200).json({
      success: true,
      archived: true,
      message:
        'Medicine has sales, purchase or stock history, so it was archived instead of deleted. It is hidden from the catalog but kept for records.',
    });
  }

  await medicine.deleteOne();
  await audit(req, { action: 'medicine.delete', entity: 'Medicine', entityId: medicine._id, before: medicine });

  return res.status(200).json({
    success: true,
    archived: false,
    message: 'Medicine deleted successfully',
  });
};

// @desc    Get distinct medicine categories for current pharmacy
// @route   GET /api/medicines/categories
// @access  medicine:view
const getCategories = async (req, res) => {
  const categories = await Medicine.distinct('category', {
    pharmacyId: req.pharmacyId,
    isArchived: { $ne: true },
  });

  return res.status(200).json({
    success: true,
    categories,
  });
};

// @desc    Find a medicine by barcode, pack barcode or SKU (POS / stock-in scanner)
// @route   GET /api/medicines/lookup?code=
// @access  medicine:view
// Response: { medicine, unit: { name, factor, price } } (unit = the scanned pack, or the base unit)
const lookupMedicine = async (req, res) => {
  const code = cleanCode(req.query.code);
  if (!code) throw new AppError('Please provide a code to look up', 400);
  if (code.length > 64) throw new AppError('Code is too long', 400);

  const found = await lookupByCode(req.pharmacyId, code);
  if (!found) throw new AppError(`No medicine found for code ${code}`, 404);

  return res.status(200).json({
    success: true,
    medicine: withMargin(found.medicine),
    unit: found.unit,
  });
};

// @desc    Assign an internal EAN-13 barcode ('2' + pharmacy sequence + check digit)
// @route   POST /api/medicines/:id/generate-barcode   body: { packUnitId? }
// @access  medicine:manage
const generateBarcode = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Medicine not found', 404);
  const medicine = await Medicine.findOne({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!medicine) throw new AppError('Medicine not found in your pharmacy catalog', 404);

  const packUnitId = req.body?.packUnitId;
  let target = medicine;
  if (packUnitId) {
    target = mongoose.isValidObjectId(packUnitId) ? medicine.packUnits.id(packUnitId) : null;
    if (!target) throw new AppError('Pack unit not found', 404);
  }
  if (target.barcode) throw new AppError('This item already has a barcode', 409);

  const code = await generateInternalBarcode(req.pharmacyId);
  target.barcode = code;
  await medicine.save();
  await audit(req, {
    action: 'medicine.generate_barcode',
    entity: 'Medicine',
    entityId: medicine._id,
    meta: { barcode: code, packUnitId: packUnitId || null },
  });

  return res.status(200).json({ success: true, barcode: code, medicine: withMargin(medicine) });
};

// Parses and validates a bulk price request body.
const parseBulkPriceBody = (body = {}) => {
  const filter = body.filter || {};
  const { mode } = body;
  const field = body.field || 'price';
  if (!['percent', 'set'].includes(mode)) throw new AppError('mode must be "percent" or "set"', 400);
  if (!['price', 'costPrice'].includes(field)) throw new AppError('field must be "price" or "costPrice"', 400);
  const value = Number(body.value);
  if (body.value === '' || body.value === null || body.value === undefined || !Number.isFinite(value)) {
    throw new AppError('Please provide a numeric value', 400);
  }
  if (mode === 'percent' && (value <= -100 || value > 1000)) {
    throw new AppError('Percentage must be greater than -100 and at most 1000', 400);
  }
  if (mode === 'set' && value < 0) throw new AppError('Price cannot be negative', 400);
  let roundTo = null;
  if (body.roundTo !== undefined && body.roundTo !== null && body.roundTo !== '') {
    roundTo = Number(body.roundTo);
    if (!Number.isFinite(roundTo) || roundTo <= 0 || roundTo > 1000) {
      throw new AppError('roundTo must be a positive number', 400);
    }
  }

  const query = { isArchived: { $ne: true } };
  if (Array.isArray(filter.ids) && filter.ids.length) {
    const ids = filter.ids.filter((id) => mongoose.isValidObjectId(id));
    if (!ids.length) throw new AppError('No valid medicine ids', 400);
    query._id = { $in: ids };
  }
  if (typeof filter.category === 'string' && filter.category.trim()) {
    query.category = filter.category.trim();
  }
  if (!query._id && !query.category && filter.all !== true) {
    throw new AppError('Choose a category, select medicines, or confirm all medicines', 400);
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
  return { query, mode, field, value, roundTo, reason };
};

const buildBulkPricePlan = async (req, { session } = {}) => {
  const rule = parseBulkPriceBody(req.body);
  const medicines = await Medicine.find({ ...rule.query, pharmacyId: req.pharmacyId })
    .select('name category price costPrice minMarginPercent')
    .sort({ name: 1 })
    .limit(MAX_BULK_PRICE_ITEMS + 1)
    .session(session || null);
  if (medicines.length > MAX_BULK_PRICE_ITEMS) {
    throw new AppError(`Too many medicines match (max ${MAX_BULK_PRICE_ITEMS}); narrow the filter`, 400);
  }
  const items = medicines.map((m) => {
    const oldValue = m[rule.field];
    const newValue = applyPriceRule(oldValue, rule);
    const after = { price: m.price, costPrice: m.costPrice, minMarginPercent: m.minMarginPercent };
    after[rule.field] = newValue;
    return {
      _id: m._id,
      name: m.name,
      category: m.category,
      field: rule.field,
      old: oldValue,
      new: newValue,
      price: after.price,
      costPrice: after.costPrice,
      changed: Number(oldValue) !== newValue,
      marginWarning: marginWarning(after),
    };
  });
  return { rule, items };
};

// @desc    Preview a bulk price update (nothing is saved)
// @route   POST /api/medicines/bulk-price/preview
// @access  price:manage
const previewBulkPrice = async (req, res) => {
  const { items } = await buildBulkPricePlan(req);
  return res.status(200).json({
    success: true,
    count: items.length,
    changedCount: items.filter((i) => i.changed).length,
    warningCount: items.filter((i) => i.marginWarning).length,
    items,
  });
};

// @desc    Apply a bulk price update
//          body: { filter: { category?, ids?, all? }, mode: 'percent'|'set', value, roundTo?, reason, field? }
// @route   POST /api/medicines/bulk-price
// @access  price:manage
const applyBulkPrice = async (req, res) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const { rule, items } = await buildBulkPricePlan(req, { session });
      const changed = items.filter((i) => i.changed);
      if (changed.length) {
        await Medicine.bulkWrite(
          changed.map((i) => ({
            updateOne: {
              filter: { _id: i._id, pharmacyId: req.pharmacyId },
              update: { $set: { [rule.field]: i.new } },
            },
          })),
          { session }
        );
        await recordPriceHistory(
          changed.map((i) => ({
            pharmacyId: req.pharmacyId,
            medicineId: i._id,
            field: rule.field,
            old: i.old,
            new: i.new,
            changedBy: req.user?._id,
            reason: rule.reason,
            source: 'bulk',
          })),
          { session }
        );
      }
      await audit(
        req,
        {
          action: 'medicine.bulk_price',
          entity: 'Medicine',
          meta: {
            filter: req.body.filter,
            mode: rule.mode,
            field: rule.field,
            value: rule.value,
            roundTo: rule.roundTo,
            reason: rule.reason,
            updated: changed.length,
          },
        },
        { session }
      );
      result = { updated: changed.length, warningCount: items.filter((i) => i.marginWarning).length };
    });
  } finally {
    await session.endSession();
  }
  return res.status(200).json({
    success: true,
    message: `Updated ${result.updated} medicine price(s)`,
    ...result,
  });
};

// @desc    Price history of one medicine (latest first)
// @route   GET /api/medicines/:id/price-history
// @access  medicine:view
const getPriceHistory = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Medicine not found', 404);
  const exists = await Medicine.exists({ _id: req.params.id, pharmacyId: req.pharmacyId });
  if (!exists) throw new AppError('Medicine not found in your pharmacy catalog', 404);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const history = await PriceHistory.find({ pharmacyId: req.pharmacyId, medicineId: req.params.id })
    .populate('changedBy', 'name')
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit);
  return res.status(200).json({ success: true, count: history.length, history });
};

module.exports = {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getCategories,
  lookupMedicine,
  generateBarcode,
  previewBulkPrice,
  applyBulkPrice,
  getPriceHistory,
};
