const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');

const MAX_PAGE_LIMIT = 200;
const DEFAULT_PAGE_LIMIT = 50;

// Pagination is opt-in via `?page=`. Without it every match is returned.
const parsePagination = (query) => {
  if (query.page === undefined) return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
};

const exactNameRegex = (name) => new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i');

const trimStr = (v) => (v === undefined || v === null ? '' : String(v).trim());

// @desc    Get all suppliers for logged-in pharmacy
// @route   GET /api/suppliers
// @access  Private (Pharmacist only)
const getSuppliers = async (req, res) => {
  const { search, status, includeArchived } = req.query;
  const query = { pharmacyId: req.pharmacyId };

  if (String(includeArchived) !== 'true') {
    query.isArchived = { $ne: true };
  }

  if (status) {
    query.status = String(status);
  }

  if (search) {
    const pattern = escapeRegex(String(search));
    query.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { contactPerson: { $regex: pattern, $options: 'i' } },
      { phone: { $regex: pattern, $options: 'i' } },
    ];
  }

  const pagination = parsePagination(req.query);
  let findQuery = Supplier.find(query).sort({ name: 1 });
  if (pagination) {
    findQuery = findQuery.skip(pagination.skip).limit(pagination.limit);
  }

  const [suppliers, total] = await Promise.all([findQuery, Supplier.countDocuments(query)]);

  const response = {
    success: true,
    count: suppliers.length,
    total,
    suppliers,
  };
  if (pagination) {
    response.page = pagination.page;
    response.limit = pagination.limit;
    response.pages = Math.ceil(total / pagination.limit);
  }

  return res.status(200).json(response);
};

// @desc    Get single supplier
// @route   GET /api/suppliers/:id
// @access  Private (Pharmacist only)
const getSupplierById = async (req, res) => {
  const supplier = await Supplier.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!supplier) {
    return res.status(404).json({
      success: false,
      message: 'Supplier not found',
    });
  }

  return res.status(200).json({
    success: true,
    supplier,
  });
};

// @desc    Create new supplier
// @route   POST /api/suppliers
// @access  Private (Pharmacist only)
const createSupplier = async (req, res) => {
  const { name, contactPerson, email, phone, address, status, notes } = req.body;

  if (!trimStr(name) || !trimStr(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Supplier name and phone number are required',
    });
  }

  const existing = await Supplier.findOne({
    pharmacyId: req.pharmacyId,
    name: exactNameRegex(name),
  });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: existing.isArchived
        ? 'An archived supplier with this name already exists in your pharmacy'
        : 'A supplier with this name already exists in your pharmacy',
    });
  }

  const supplier = await Supplier.create({
    pharmacyId: req.pharmacyId,
    name: trimStr(name),
    contactPerson: trimStr(contactPerson),
    email: trimStr(email),
    phone: trimStr(phone),
    address: trimStr(address),
    status: status || 'active',
    notes: trimStr(notes),
  });

  return res.status(201).json({
    success: true,
    message: 'Supplier created successfully',
    supplier,
  });
};

// @desc    Update supplier
// @route   PUT /api/suppliers/:id
// @access  Private (Pharmacist only)
const updateSupplier = async (req, res) => {
  const supplier = await Supplier.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!supplier) {
    return res.status(404).json({
      success: false,
      message: 'Supplier not found',
    });
  }

  const { name, contactPerson, email, phone, address, status, notes } = req.body || {};

  if (name !== undefined && trimStr(name)) {
    const newName = trimStr(name);
    if (newName.toLowerCase() !== supplier.name.toLowerCase()) {
      const duplicate = await Supplier.findOne({
        pharmacyId: req.pharmacyId,
        _id: { $ne: supplier._id },
        name: exactNameRegex(newName),
      });
      if (duplicate) {
        throw new AppError('A supplier with this name already exists in your pharmacy', 409);
      }
    }
    supplier.name = newName;
  }
  if (contactPerson !== undefined) supplier.contactPerson = trimStr(contactPerson);
  if (email !== undefined) supplier.email = trimStr(email);
  if (phone !== undefined && trimStr(phone)) supplier.phone = trimStr(phone);
  if (address !== undefined) supplier.address = trimStr(address);
  if (status) supplier.status = status;
  if (notes !== undefined) supplier.notes = trimStr(notes);

  await supplier.save();

  return res.status(200).json({
    success: true,
    message: 'Supplier updated successfully',
    supplier,
  });
};

// @desc    Delete supplier (archives it instead if it has purchase orders)
// @route   DELETE /api/suppliers/:id
// @access  Private (Pharmacist only)
const deleteSupplier = async (req, res) => {
  const supplier = await Supplier.findOne({
    _id: req.params.id,
    pharmacyId: req.pharmacyId,
  });

  if (!supplier) {
    return res.status(404).json({
      success: false,
      message: 'Supplier not found',
    });
  }

  const scope = { pharmacyId: req.pharmacyId, supplierId: supplier._id };

  const openOrder = await PurchaseOrder.exists({ ...scope, status: 'ordered' });
  if (openOrder) {
    throw new AppError(
      'This supplier has open purchase orders. Receive or cancel them before removing the supplier.',
      409
    );
  }

  const anyOrder = await PurchaseOrder.exists(scope);
  if (anyOrder) {
    supplier.isArchived = true;
    supplier.status = 'inactive';
    await supplier.save();
    return res.status(200).json({
      success: true,
      archived: true,
      message:
        'Supplier has purchase order history, so it was archived instead of deleted. It is hidden from the list but kept for records.',
    });
  }

  await supplier.deleteOne();

  return res.status(200).json({
    success: true,
    archived: false,
    message: 'Supplier deleted successfully',
  });
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
