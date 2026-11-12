const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const generateToken = require('../utils/generateToken');
const { changeUserPassword } = require('./authController');

// @desc    Get logged in pharmacist's pharmacy details
// @route   GET /api/pharmacy/my-pharmacy
// @access  Private (Pharmacist only)
const getMyPharmacy = async (req, res) => {
  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  if (!pharmacy) {
    throw new AppError('Pharmacy not found', 404);
  }

  return res.status(200).json({
    success: true,
    pharmacyId: req.pharmacyId,
    pharmacy,
  });
};

// @desc    Update pharmacy details (phone, address)
// @route   PUT /api/pharmacy/my-pharmacy
// @access  Private (Pharmacist only)
const updateMyPharmacy = async (req, res) => {
  const { phone, address } = req.body || {};

  const pharmacy = await Pharmacy.findById(req.pharmacyId);
  if (!pharmacy) {
    throw new AppError('Pharmacy not found', 404);
  }

  if (typeof phone === 'string' && phone.trim()) pharmacy.phone = phone.trim();
  if (typeof address === 'string' && address.trim()) pharmacy.address = address.trim();

  await pharmacy.save();

  return res.status(200).json({
    success: true,
    message: 'Pharmacy settings updated successfully',
    pharmacy,
  });
};

// @desc    Update pharmacist personal profile & password
// @route   PUT /api/pharmacy/profile
// @access  Private (Pharmacist only)
// When the password changes, all previous tokens are revoked and a new token
// is returned in the response.
const updatePharmacistProfile = async (req, res) => {
  const { name, currentPassword, newPassword } = req.body || {};

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError('User account not found', 404);
  }

  if (typeof name === 'string' && name.trim()) user.name = name.trim();

  const passwordChanged = Boolean(newPassword);
  if (passwordChanged) {
    await changeUserPassword(user, currentPassword, newPassword);
  }

  await user.save();

  return res.status(200).json({
    success: true,
    message: passwordChanged ? 'Profile and password updated successfully' : 'Profile updated successfully',
    ...(passwordChanged && { token: generateToken(user._id, user.role, user.tokenVersion) }),
    user: {
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

module.exports = {
  getMyPharmacy,
  updateMyPharmacy,
  updatePharmacistProfile,
};
