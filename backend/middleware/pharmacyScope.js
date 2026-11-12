const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

// Resolves the pharmacy tenant for the request and sets req.pharmacyId (and
// req.pharmacy for pharmacists). Must run after `protect`.
const pharmacyScope = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required for pharmacy operations',
    });
  }

  // Pharmacist: automatically resolve and attach their owned pharmacy
  if (req.user.role === 'pharmacist') {
    // `protect` already loaded it (and rejected suspended/archived ones)
    const pharmacy = req.pharmacy || (await Pharmacy.findOne({ owner: req.user._id }));

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'No pharmacy found associated with this pharmacist account',
      });
    }

    if (pharmacy.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: pharmacy.status === 'archived' ? 'PHARMACY_ARCHIVED' : 'PHARMACY_SUSPENDED',
        message:
          pharmacy.status === 'archived'
            ? 'This pharmacy account has been closed by the administrator'
            : 'This pharmacy has been suspended by the administrator',
      });
    }

    req.pharmacy = pharmacy;
    req.pharmacyId = pharmacy._id;
    return next();
  }

  // Admin: optionally scoped via header or query parameter
  if (req.user.role === 'admin') {
    const targetPharmacyId = req.headers['x-pharmacy-id'] || req.query.pharmacyId;

    if (targetPharmacyId) {
      if (typeof targetPharmacyId !== 'string' || !OBJECT_ID_RE.test(targetPharmacyId)) {
        return res.status(400).json({ success: false, message: 'Invalid pharmacy id' });
      }
      // ObjectId (not string) so aggregation $match on pharmacyId works too
      req.pharmacyId = new mongoose.Types.ObjectId(targetPharmacyId);
    }
    return next();
  }

  return next();
};

pharmacyScope.pharmacyScope = pharmacyScope;
module.exports = pharmacyScope;
