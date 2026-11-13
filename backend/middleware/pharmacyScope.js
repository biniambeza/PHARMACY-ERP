const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const {
  ensureMemberships,
  activeMemberships,
  findMembership,
  pharmacyBlockedResponse,
  sameId,
} = require('../utils/membership');

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

// Resolves the pharmacy tenant (branch) for the request. Must run after `protect`.
//
// Tenant users (role 'pharmacist'): the branch is chosen with the
// `x-pharmacy-id` header and validated against the user's active memberships.
// Without the header, the first active membership (preferring an active
// pharmacy) is used. Sets req.pharmacy, req.pharmacyId and req.membershipRole.
//
// Admin: optionally scoped via `x-pharmacy-id` header or `pharmacyId` query
// parameter (sets req.pharmacyId only).
const pharmacyScope = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required for pharmacy operations',
    });
  }

  if (req.user.role === 'pharmacist') {
    const memberships = activeMemberships(await ensureMemberships(req.user));
    const requested = req.headers['x-pharmacy-id'];

    let pharmacies = req.userPharmacies;
    if (!pharmacies) {
      pharmacies = memberships.length
        ? await Pharmacy.find({ _id: { $in: memberships.map((m) => m.pharmacyId) } })
        : [];
    }
    const pharmacyOf = (m) => pharmacies.find((p) => sameId(p._id, m.pharmacyId));

    let membership;
    if (requested) {
      if (typeof requested !== 'string' || !OBJECT_ID_RE.test(requested)) {
        return res.status(400).json({ success: false, message: 'Invalid pharmacy id' });
      }
      membership = findMembership(memberships, requested);
      if (!membership) {
        return res.status(403).json({
          success: false,
          code: 'NO_BRANCH_ACCESS',
          message: 'You do not have access to this pharmacy',
        });
      }
    } else {
      membership =
        memberships.find((m) => pharmacyOf(m)?.status === 'active') ||
        memberships.find((m) => pharmacyOf(m)) ||
        null;
    }

    const pharmacy = membership ? pharmacyOf(membership) : null;
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'No pharmacy found associated with this account',
      });
    }

    if (pharmacy.status !== 'active') {
      return res.status(403).json(pharmacyBlockedResponse(pharmacy));
    }

    req.pharmacy = pharmacy;
    req.pharmacyId = pharmacy._id;
    req.membershipRole = membership.role;
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
