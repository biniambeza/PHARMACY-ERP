const Supplier = require('../models/Supplier');

// @desc    Get all suppliers for logged-in pharmacy
// @route   GET /api/suppliers
// @access  Private (Pharmacist only)
const getSuppliers = async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = { pharmacyId: req.pharmacyId };

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const suppliers = await Supplier.find(query).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: suppliers.length,
      suppliers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single supplier
// @route   GET /api/suppliers/:id
// @access  Private (Pharmacist only)
const getSupplierById = async (req, res) => {
  try {
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create new supplier
// @route   POST /api/suppliers
// @access  Private (Pharmacist only)
const createSupplier = async (req, res) => {
  try {
    const { name, contactPerson, email, phone, address, status, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Supplier name and phone number are required',
      });
    }

    const existing = await Supplier.findOne({
      pharmacyId: req.pharmacyId,
      name: name.trim(),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A supplier with this name already exists in your pharmacy',
      });
    }

    const supplier = await Supplier.create({
      pharmacyId: req.pharmacyId,
      name: name.trim(),
      contactPerson: contactPerson?.trim() || '',
      email: email?.trim() || '',
      phone: phone.trim(),
      address: address?.trim() || '',
      status: status || 'active',
      notes: notes?.trim() || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      supplier,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update supplier
// @route   PUT /api/suppliers/:id
// @access  Private (Pharmacist only)
const updateSupplier = async (req, res) => {
  try {
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

    const { name, contactPerson, email, phone, address, status, notes } = req.body;

    if (name) supplier.name = name.trim();
    if (contactPerson !== undefined) supplier.contactPerson = contactPerson.trim();
    if (email !== undefined) supplier.email = email.trim();
    if (phone) supplier.phone = phone.trim();
    if (address !== undefined) supplier.address = address.trim();
    if (status) supplier.status = status;
    if (notes !== undefined) supplier.notes = notes.trim();

    await supplier.save();

    return res.status(200).json({
      success: true,
      message: 'Supplier updated successfully',
      supplier,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete supplier
// @route   DELETE /api/suppliers/:id
// @access  Private (Pharmacist only)
const deleteSupplier = async (req, res) => {
  try {
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

    await supplier.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
