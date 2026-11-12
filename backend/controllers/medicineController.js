const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/PurchaseOrder');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');

const MAX_PAGE_LIMIT = 200;
const DEFAULT_PAGE_LIMIT = 50;

// Fields a pharmacist is allowed to set on a medicine.
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
];

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

// @desc    Get all medicines for the logged-in pharmacy
// @route   GET /api/medicines
// @access  Private (Pharmacist only)
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
    query.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { genericName: { $regex: pattern, $options: 'i' } },
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
    medicines,
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
// @access  Private (Pharmacist only)
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
    medicine,
  });
};

// @desc    Create a new medicine in the pharmacy catalog
// @route   POST /api/medicines
// @access  Private (Pharmacist only)
const createMedicine = async (req, res) => {
  const {
    name,
    genericName,
    category,
    dosageForm,
    strength,
    price,
    costPrice,
    minStockLevel,
    requiresPrescription,
  } = req.body;

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

  const medicine = await Medicine.create({
    pharmacyId: req.pharmacyId,
    name: name.trim(),
    genericName,
    category,
    dosageForm,
    strength,
    price,
    costPrice,
    minStockLevel,
    requiresPrescription,
  });

  return res.status(201).json({
    success: true,
    message: 'Medicine added successfully',
    medicine,
  });
};

// @desc    Update a medicine
// @route   PUT /api/medicines/:id
// @access  Private (Pharmacist only)
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

  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      medicine[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
    }
  }

  await medicine.save();

  return res.status(200).json({
    success: true,
    message: 'Medicine updated successfully',
    medicine,
  });
};

// @desc    Delete a medicine (archives it instead if it has history)
// @route   DELETE /api/medicines/:id
// @access  Private (Pharmacist only)
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
    PurchaseOrder.exists({ ...scope, status: 'ordered', 'items.medicineId': medicine._id }),
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
    }
    return res.status(200).json({
      success: true,
      archived: true,
      message:
        'Medicine has sales, purchase or stock history, so it was archived instead of deleted. It is hidden from the catalog but kept for records.',
    });
  }

  await medicine.deleteOne();

  return res.status(200).json({
    success: true,
    archived: false,
    message: 'Medicine deleted successfully',
  });
};

// @desc    Get distinct medicine categories for current pharmacy
// @route   GET /api/medicines/categories
// @access  Private (Pharmacist only)
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

module.exports = {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getCategories,
};
