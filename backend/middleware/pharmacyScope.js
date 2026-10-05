const Pharmacy = require('../models/Pharmacy');

const pharmacyScope = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for pharmacy operations',
      });
    }

    // Pharmacist: automatically resolve and attach their owned pharmacy
    if (req.user.role === 'pharmacist') {
      const pharmacy = await Pharmacy.findOne({ owner: req.user._id });

      if (!pharmacy) {
        return res.status(404).json({
          success: false,
          message: 'No pharmacy found associated with this pharmacist account',
        });
      }

      if (pharmacy.status === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'This pharmacy has been suspended by the administrator',
        });
      }

      req.pharmacy = pharmacy;
      req.pharmacyId = pharmacy._id;
      return next();
    }

    // Admin: optionally scoped via header or query parameter
    if (req.user.role === 'admin') {
      const targetPharmacyId =
        req.headers['x-pharmacy-id'] || req.query.pharmacyId;

      if (targetPharmacyId) {
        req.pharmacyId = targetPharmacyId;
      }
      return next();
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Pharmacy scope error: ${error.message}`,
    });
  }
};

module.exports = { pharmacyScope };
