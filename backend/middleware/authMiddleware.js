const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');

const unauthorized = (res, message) => res.status(401).json({ success: false, message });

// Verifies the Bearer token, loads the user and rejects:
//  - invalid / expired tokens
//  - tokens issued before the user's tokenVersion was bumped (password change)
//  - pharmacists whose pharmacy is suspended or archived
// On success sets req.user (and req.pharmacy for pharmacists, reused by pharmacyScope).
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
    const pharmacy = await Pharmacy.findOne({ owner: user._id });
    if (pharmacy && pharmacy.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: pharmacy.status === 'archived' ? 'PHARMACY_ARCHIVED' : 'PHARMACY_SUSPENDED',
        message:
          pharmacy.status === 'archived'
            ? 'This pharmacy account has been closed. Please contact the administrator.'
            : 'This pharmacy has been suspended by the administrator',
      });
    }
    req.pharmacy = pharmacy || undefined;
  }

  req.user = user;
  return next();
};

module.exports = { protect };
