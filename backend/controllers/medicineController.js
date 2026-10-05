const Medicine = require('../models/Medicine');

// @desc    Get all medicines for the logged-in pharmacy
// @route   GET /api/medicines
// @access  Private (Pharmacist only)
const getMedicines = async (req, res) => {
  try {
    const { search, category } = req.query;
    const query = { pharmacyId: req.pharmacyId };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } },
      ];
    }

    const medicines = await Medicine.find(query).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: medicines.length,
      medicines,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single medicine by ID
// @route   GET /api/medicines/:id
// @access  Private (Pharmacist only)
const getMedicineById = async (req, res) => {
  try {
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create a new medicine in the pharmacy catalog
// @route   POST /api/medicines
// @access  Private (Pharmacist only)
const createMedicine = async (req, res) => {
  try {
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

    if (!name || !category || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, category, and price',
      });
    }

    const existing = await Medicine.findOne({
      pharmacyId: req.pharmacyId,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A medicine with this name already exists in your catalog',
      });
    }

    const medicine = await Medicine.create({
      pharmacyId: req.pharmacyId,
      name,
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update a medicine
// @route   PUT /api/medicines/:id
// @access  Private (Pharmacist only)
const updateMedicine = async (req, res) => {
  try {
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

    const updated = await Medicine.findByIdAndUpdate(
      req.params.id,
      { ...req.body, pharmacyId: req.pharmacyId },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Medicine updated successfully',
      medicine: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete a medicine
// @route   DELETE /api/medicines/:id
// @access  Private (Pharmacist only)
const deleteMedicine = async (req, res) => {
  try {
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

    await medicine.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Medicine deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get distinct medicine categories for current pharmacy
// @route   GET /api/medicines/categories
// @access  Private (Pharmacist only)
const getCategories = async (req, res) => {
  try {
    const categories = await Medicine.distinct('category', {
      pharmacyId: req.pharmacyId,
    });

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getCategories,
};
