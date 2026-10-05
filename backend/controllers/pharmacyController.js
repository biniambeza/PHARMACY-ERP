const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');

// @desc    Get logged in pharmacist's pharmacy details
// @route   GET /api/pharmacy/my-pharmacy
// @access  Private (Pharmacist only)
const getMyPharmacy = async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found',
      });
    }

    return res.status(200).json({
      success: true,
      pharmacyId: req.pharmacyId,
      pharmacy,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update pharmacy details (phone, address)
// @route   PUT /api/pharmacy/my-pharmacy
// @access  Private (Pharmacist only)
const updateMyPharmacy = async (req, res) => {
  try {
    const { phone, address } = req.body;

    const pharmacy = await Pharmacy.findById(req.pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found',
      });
    }

    if (phone) pharmacy.phone = phone.trim();
    if (address) pharmacy.address = address.trim();

    await pharmacy.save();

    return res.status(200).json({
      success: true,
      message: 'Pharmacy settings updated successfully',
      pharmacy,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update pharmacist personal profile & password
// @route   PUT /api/pharmacy/profile
// @access  Private (Pharmacist only)
const updatePharmacistProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found',
      });
    }

    if (name) user.name = name.trim();

    // If changing password, verify current password first
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Please provide your current password to set a new password',
        });
      }

      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password does not match',
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters long',
        });
      }

      user.password = newPassword; // Will be hashed by User pre-save hook
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
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
  getMyPharmacy,
  updateMyPharmacy,
  updatePharmacistProfile,
};
