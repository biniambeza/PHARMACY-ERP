// Helpers for User.memberships (staff roles per pharmacy / branch).
const Pharmacy = require('../models/Pharmacy');
const User = require('../models/User');

const sameId = (a, b) => String(a) === String(b);

// Returns the user's memberships. Legacy users (role 'pharmacist', no
// memberships) who own pharmacies through Pharmacy.owner get an 'owner'
// membership for each, persisted once (lazy migration).
const ensureMemberships = async (user) => {
  if (!user || user.role !== 'pharmacist') return [];
  if (Array.isArray(user.memberships) && user.memberships.length > 0) return user.memberships;

  const owned = await Pharmacy.find({ owner: user._id }).select('_id organizationId').lean();
  if (!owned.length) return user.memberships || [];

  const memberships = owned.map((p) => ({ pharmacyId: p._id, role: 'owner', active: true }));
  const organizationId = user.organizationId || owned.find((p) => p.organizationId)?.organizationId || null;

  // Only migrate if still empty (no race with a concurrent migration / staff change)
  await User.updateOne(
    { _id: user._id, $or: [{ memberships: { $exists: false } }, { memberships: { $size: 0 } }] },
    { $set: { memberships, ...(organizationId && !user.organizationId ? { organizationId } : {}) } }
  );

  user.memberships = memberships;
  if (organizationId && !user.organizationId) user.organizationId = organizationId;
  return user.memberships;
};

const activeMemberships = (memberships) => (memberships || []).filter((m) => m.active !== false);

const findMembership = (memberships, pharmacyId) =>
  (memberships || []).find((m) => sameId(m.pharmacyId, pharmacyId));

const pharmacyBlockedResponse = (pharmacy) => ({
  success: false,
  code: pharmacy.status === 'archived' ? 'PHARMACY_ARCHIVED' : 'PHARMACY_SUSPENDED',
  message:
    pharmacy.status === 'archived'
      ? 'This pharmacy account has been closed. Please contact the administrator.'
      : 'This pharmacy has been suspended by the administrator',
});

// Memberships enriched with the pharmacy's name/status, for API responses.
// `pharmacies` (optional) avoids a second query when already loaded.
const describeMemberships = async (user, pharmacies) => {
  const memberships = user && user.role === 'pharmacist' ? user.memberships || [] : [];
  if (!memberships.length) return [];
  let list = pharmacies;
  const loaded = new Set((list || []).map((p) => String(p._id)));
  const missing = memberships.filter((m) => !loaded.has(String(m.pharmacyId)));
  if (!list || missing.length) {
    list = await Pharmacy.find({ _id: { $in: memberships.map((m) => m.pharmacyId) } })
      .select('name status organizationId address phone')
      .lean();
  }
  const byId = new Map(list.map((p) => [String(p._id), p]));
  return memberships
    .filter((m) => byId.has(String(m.pharmacyId)))
    .map((m) => {
      const p = byId.get(String(m.pharmacyId));
      return {
        pharmacyId: m.pharmacyId,
        role: m.role,
        active: m.active !== false,
        pharmacy: {
          _id: p._id,
          name: p.name,
          status: p.status,
          organizationId: p.organizationId || null,
          address: p.address,
          phone: p.phone,
        },
      };
    });
};

module.exports = {
  ensureMemberships,
  activeMemberships,
  findMembership,
  describeMemberships,
  pharmacyBlockedResponse,
  sameId,
};
