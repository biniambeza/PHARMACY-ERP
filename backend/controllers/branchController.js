const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const Organization = require('../models/Organization');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { describeMemberships } = require('../utils/membership');

// @desc    List the branches (pharmacies) the current user is a member of
// @route   GET /api/branches
// @access  Any tenant user
const getMyBranches = async (req, res) => {
  const branches = await describeMemberships(req.user);
  return res.status(200).json({
    success: true,
    activePharmacyId: req.pharmacyId || null,
    organizationId: req.pharmacy?.organizationId || req.user.organizationId || null,
    branches,
  });
};

// @desc    Create a new branch in the active pharmacy's organization. The
//          organization is created lazily if the pharmacy has none yet.
// @route   POST /api/branches   { name, address, phone, licenseNo }
// @access  branch:manage (owner)
const createBranch = async (req, res) => {
  const { name, address, phone, licenseNo } = req.body || {};
  const fields = [name, address, phone, licenseNo];
  if (fields.some((f) => typeof f !== 'string' || !f.trim())) {
    throw new AppError('Please provide name, address, phone and license number', 400);
  }
  if (await Pharmacy.exists({ licenseNo: licenseNo.trim() })) {
    throw new AppError('Pharmacy with this license number already exists', 409);
  }

  const session = await mongoose.startSession();
  let branch;
  let organizationId;
  try {
    await session.withTransaction(async () => {
      const current = await Pharmacy.findById(req.pharmacyId).session(session);
      if (!current) throw new AppError('Pharmacy not found', 404);

      organizationId = current.organizationId;
      if (!organizationId) {
        const [org] = await Organization.create(
          [{ name: current.name, ownerId: req.user._id }],
          { session }
        );
        organizationId = org._id;
        current.organizationId = organizationId;
        await current.save({ session });
      }

      [branch] = await Pharmacy.create(
        [
          {
            name: name.trim(),
            address: address.trim(),
            phone: phone.trim(),
            licenseNo: licenseNo.trim(),
            owner: req.user._id,
            organizationId,
            // New branches start with the same settings as the current one
            settings: current.settings ? current.settings.toObject() : undefined,
          },
        ],
        { session }
      );

      await User.updateOne(
        { _id: req.user._id },
        {
          $set: { organizationId },
          $push: { memberships: { pharmacyId: branch._id, role: 'owner', active: true } },
        },
        { session }
      );

      await audit(
        req,
        {
          action: 'branch.create',
          entity: 'Pharmacy',
          entityId: branch._id,
          after: branch,
          meta: { organizationId },
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return res.status(201).json({
    success: true,
    message: 'Branch created',
    organizationId,
    branch,
  });
};

module.exports = { getMyBranches, createBranch };
