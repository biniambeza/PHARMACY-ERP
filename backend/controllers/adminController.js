const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const Sale = require('../models/Sale');
const StockBatch = require('../models/StockBatch');

// @desc    Create a new pharmacy and its pharmacist user account
// @route   POST /api/admin/pharmacies
// @access  Private (Admin only)
const createPharmacy = async (req, res) => {
  try {
    const {
      name,
      address,
      phone,
      licenseNo,
      pharmacistName,
      pharmacistEmail,
      pharmacistPassword,
    } = req.body;

    if (
      !name ||
      !address ||
      !phone ||
      !licenseNo ||
      !pharmacistName ||
      !pharmacistEmail ||
      !pharmacistPassword
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all pharmacy and pharmacist fields',
      });
    }

    const userExists = await User.findOne({ email: pharmacistEmail.toLowerCase() });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists',
      });
    }

    const licenseExists = await Pharmacy.findOne({ licenseNo });
    if (licenseExists) {
      return res.status(400).json({
        success: false,
        message: 'Pharmacy with this license number already exists',
      });
    }

    // 1. Create the Pharmacist User
    const pharmacist = await User.create({
      name: pharmacistName,
      email: pharmacistEmail,
      password: pharmacistPassword,
      role: 'pharmacist',
    });

    // 2. Create the Pharmacy Record
    let pharmacy;
    try {
      pharmacy = await Pharmacy.create({
        name,
        address,
        phone,
        licenseNo,
        owner: pharmacist._id,
      });
    } catch (err) {
      await User.findByIdAndDelete(pharmacist._id);
      throw err;
    }

    await pharmacy.populate('owner', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Pharmacy and pharmacist account created successfully',
      pharmacy,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all pharmacies
// @route   GET /api/admin/pharmacies
// @access  Private (Admin only)
const getPharmacies = async (req, res) => {
  try {
    const pharmacies = await Pharmacy.find()
      .populate('owner', 'name email role')
      .sort({ createdAt: -1 });

    const pharmaciesWithMetrics = await Promise.all(
      pharmacies.map(async (p) => {
        const pObj = p.toObject();
        const activeBatches = await StockBatch.countDocuments({
          pharmacyId: p._id,
          status: 'active',
          quantity: { $gt: 0 },
        });
        const totalSales = await Sale.countDocuments({ pharmacyId: p._id });
        return {
          ...pObj,
          activeBatches,
          totalSales,
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: pharmaciesWithMetrics.length,
      pharmacies: pharmaciesWithMetrics,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Toggle pharmacy status (active / suspended)
// @route   PATCH /api/admin/pharmacies/:id/toggle-status
// @access  Private (Admin only)
const togglePharmacyStatus = async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found',
      });
    }

    pharmacy.status = pharmacy.status === 'active' ? 'suspended' : 'active';
    await pharmacy.save();
    await pharmacy.populate('owner', 'name email role');

    return res.status(200).json({
      success: true,
      message: `Pharmacy status updated to ${pharmacy.status}`,
      pharmacy,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete a pharmacy and its pharmacist user account
// @route   DELETE /api/admin/pharmacies/:id
// @access  Private (Admin only)
const deletePharmacy = async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id);

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found',
      });
    }

    await User.findByIdAndDelete(pharmacy.owner);
    await pharmacy.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Pharmacy and associated pharmacist account deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get system overview stats
// @route   GET /api/admin/stats
// @access  Private (Admin only)
const getSystemStats = async (req, res) => {
  try {
    const totalPharmacies = await Pharmacy.countDocuments();
    const activePharmacies = await Pharmacy.countDocuments({ status: 'active' });
    const suspendedPharmacies = await Pharmacy.countDocuments({ status: 'suspended' });
    const totalPharmacists = await User.countDocuments({ role: 'pharmacist' });

    // Multi-tenant aggregated throughput
    const salesAgg = await Sale.aggregate([
      { $group: { _id: null, totalGrossVolume: { $sum: '$grandTotal' }, totalTransactions: { $sum: 1 } } },
    ]);
    const totalGrossVolume = Number((salesAgg[0]?.totalGrossVolume || 0).toFixed(2));
    const totalTransactions = salesAgg[0]?.totalTransactions || 0;

    return res.status(200).json({
      success: true,
      stats: {
        totalPharmacies,
        activePharmacies,
        suspendedPharmacies,
        totalPharmacists,
        totalGrossVolume,
        totalTransactions,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createPharmacy,
  getPharmacies,
  togglePharmacyStatus,
  deletePharmacy,
  getSystemStats,
};
