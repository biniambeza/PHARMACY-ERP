const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');
const { ensureMemberships, activeMemberships, pharmacyBlockedResponse } = require('../utils/membership');

const unauthorized = (res, message) => res.status(401).json({ success: false, message });

// Verifies the Bearer token, loads the user and rejects:
//  - invalid / expired tokens
//  - tokens issued before the user's tokenVersion was bumped (password change)
//  - pharmacists (tenant users) whose memberships are all deactivated
//  - pharmacists whose pharmacies are all suspended or archived
// On success sets req.user (and req.userPharmacies for tenant users, reused by pharmacyScope).
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return unauthorized(res, 'Not authorized, no token provided');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return unauthorized(res, 'Not authorized, token failed');
  }

  // DB errors here propagate to the central error handler (500), not 401.
  const user = await User.findById(decoded.id).select('-password');
  if (!user) {
    return unauthorized(res, 'User not found');
  }

  if (typeof decoded.tv !== 'number' || decoded.tv !== (user.tokenVersion || 0)) {
    return unauthorized(res, 'Session expired, please log in again');
  }

  if (user.role === 'pharmacist') {
    // Legacy owners (Pharmacy.owner, no memberships) are migrated here
    const memberships = await ensureMemberships(user);
    const active = activeMemberships(memberships);

    if (memberships.length && !active.length) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your staff account has been deactivated. Please contact the pharmacy owner.',
      });
    }

    if (active.length) {
      const pharmacies = await Pharmacy.find({ _id: { $in: active.map((m) => m.pharmacyId) } });
      // Reject only when none of the user's pharmacies is usable; a blocked
      // branch is rejected by pharmacyScope when it is selected.
      if (pharmacies.length && !pharmacies.some((p) => p.status === 'active')) {
        return res.status(403).json(pharmacyBlockedResponse(pharmacies[0]));
      }
      req.userPharmacies = pharmacies;
    } else {
      req.userPharmacies = [];
    }
  }

  req.user = user;
  return next();
};

module.exports = { protect };
