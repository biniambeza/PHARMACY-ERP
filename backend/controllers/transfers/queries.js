const Transfer = require('../../models/Transfer');
const Pharmacy = require('../../models/Pharmacy');
const Organization = require('../../models/Organization');
const Medicine = require('../../models/Medicine');
const StockBatch = require('../../models/StockBatch');
const Sale = require('../../models/Sale');
const AppError = require('../../utils/AppError');
const { sameId } = require('../../utils/membership');
const { isId, populateTransfer } = require('./helpers');

// ----- endpoints -------------------------------------------------------------

// @desc    Other active branches of the current pharmacy's organization
// @route   GET /api/transfers/destinations
// @access  transfer:manage
const getDestinations = async (req, res) => {
  const pharmacy = req.pharmacy || (await Pharmacy.findById(req.pharmacyId));
  if (!pharmacy || !pharmacy.organizationId) {
    return res.status(200).json({ success: true, organizationId: null, branches: [] });
  }
  const branches = await Pharmacy.find({
    organizationId: pharmacy.organizationId,
    _id: { $ne: pharmacy._id },
    status: 'active',
  })
    .select('name address phone status')
    .sort({ name: 1 })
    .lean();
  return res.status(200).json({ success: true, organizationId: pharmacy.organizationId, branches });
};

// @desc    List transfers of the current branch
// @route   GET /api/transfers?direction=outgoing|incoming|all&status=&page=&limit=
// @access  transfer:manage
const listTransfers = async (req, res) => {
  const direction = ['outgoing', 'incoming'].includes(req.query.direction) ? req.query.direction : 'all';
  const filter = {};
  if (direction === 'outgoing') filter.fromPharmacyId = req.pharmacyId;
  else if (direction === 'incoming') {
    filter.toPharmacyId = req.pharmacyId;
    // Drafts are private to the source branch
    filter.status = { $ne: 'draft' };
  } else {
    filter.$or = [
      { fromPharmacyId: req.pharmacyId },
      { toPharmacyId: req.pharmacyId, status: { $ne: 'draft' } },
    ];
  }
  const statuses = ['draft', 'in_transit', 'received', 'cancelled'];
  if (typeof req.query.status === 'string' && statuses.includes(req.query.status)) {
    if (direction === 'incoming' && req.query.status === 'draft') {
      return res.status(200).json({ success: true, total: 0, page: 1, pages: 1, transfers: [] });
    }
    if (filter.$or) filter.$and = [{ status: req.query.status }];
    else filter.status = req.query.status;
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const [transfers, total] = await Promise.all([
    populateTransfer(Transfer.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
    Transfer.countDocuments(filter),
  ]);
  return res.status(200).json({ success: true, total, page, pages: Math.ceil(total / limit) || 1, transfers });
};

// @desc    One transfer (source or destination branch)
// @route   GET /api/transfers/:id
// @access  transfer:manage
const getTransfer = async (req, res) => {
  if (!isId(req.params.id)) throw new AppError('Invalid id', 400);
  const transfer = await populateTransfer(
    Transfer.findOne({
      _id: req.params.id,
      $or: [{ fromPharmacyId: req.pharmacyId }, { toPharmacyId: req.pharmacyId, status: { $ne: 'draft' } }],
    })
  ).lean();
  if (!transfer) throw new AppError('Transfer not found', 404);
  return res.status(200).json({ success: true, transfer });
};

// @desc    Consolidated figures for every branch of the organization:
//          sales totals, stock value and low-stock count per branch + total.
// @route   GET /api/transfers/consolidated?from=&to=
// @access  Organization owner (or the owner of a single pharmacy); admins in support mode
const getConsolidated = async (req, res) => {
  const pharmacy = req.pharmacy || (await Pharmacy.findById(req.pharmacyId));
  if (!pharmacy) throw new AppError('Pharmacy not found', 404);

  let branches;
  let organization = null;
  if (pharmacy.organizationId) {
    organization = await Organization.findById(pharmacy.organizationId).lean();
  }
  const isAdmin = req.user.role === 'admin';
  if (organization) {
    if (!isAdmin && !sameId(organization.ownerId, req.user._id)) {
      throw new AppError('Only the organization owner can view consolidated reports', 403);
    }
    branches = await Pharmacy.find({ organizationId: organization._id, status: { $ne: 'archived' } })
      .select('name address status')
      .sort({ name: 1 })
      .lean();
  } else {
    if (!isAdmin && req.membershipRole !== 'owner') {
      throw new AppError('Only the owner can view consolidated reports', 403);
    }
    branches = [{ _id: pharmacy._id, name: pharmacy.name, address: pharmacy.address, status: pharmacy.status }];
  }

  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new AppError('Invalid date range', 400);
  if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to))) to.setUTCHours(23, 59, 59, 999);

  const ids = branches.map((b) => b._id);
  const now = new Date();

  const [salesRows, stockRows, lowRows] = await Promise.all([
    Sale.aggregate([
      { $match: { pharmacyId: { $in: ids }, createdAt: { $gte: from, $lte: to }, voided: { $ne: true } } },
      { $group: { _id: '$pharmacyId', salesTotal: { $sum: '$grandTotal' }, salesCount: { $sum: 1 } } },
    ]),
    StockBatch.aggregate([
      { $match: { pharmacyId: { $in: ids }, status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
      {
        $group: {
          _id: '$pharmacyId',
          stockValue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$purchasePrice', 0] }] } },
          units: { $sum: '$quantity' },
        },
      },
    ]),
    // Mirrors the dashboard: low = 0 < sellable qty <= (minStockLevel || 10)
    Medicine.aggregate([
      { $match: { pharmacyId: { $in: ids }, isArchived: { $ne: true } } },
      { $project: { pharmacyId: 1, minStockLevel: 1 } },
      {
        $lookup: {
          from: StockBatch.collection.name,
          localField: '_id',
          foreignField: 'medicineId',
          pipeline: [
            { $match: { status: 'active', quantity: { $gt: 0 }, expiryDate: { $gt: now } } },
            { $group: { _id: null, qty: { $sum: '$quantity' } } },
          ],
          as: 'stock',
        },
      },
      {
        $project: {
          pharmacyId: 1,
          qty: { $ifNull: [{ $first: '$stock.qty' }, 0] },
          minLevel: { $cond: [{ $in: [{ $ifNull: ['$minStockLevel', 0] }, [0]] }, 10, '$minStockLevel'] },
        },
      },
      {
        $group: {
          _id: '$pharmacyId',
          lowStockCount: {
            $sum: { $cond: [{ $and: [{ $gt: ['$qty', 0] }, { $lte: ['$qty', '$minLevel'] }] }, 1, 0] },
          },
          outOfStockCount: { $sum: { $cond: [{ $lte: ['$qty', 0] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const map = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const salesMap = map(salesRows);
  const stockMap = map(stockRows);
  const lowMap = map(lowRows);
  const round = (n) => Math.round((n || 0) * 100) / 100;

  const rows = branches.map((b) => {
    const s = salesMap.get(String(b._id)) || {};
    const st = stockMap.get(String(b._id)) || {};
    const lo = lowMap.get(String(b._id)) || {};
    return {
      pharmacyId: b._id,
      name: b.name,
      address: b.address,
      status: b.status,
      salesTotal: round(s.salesTotal),
      salesCount: s.salesCount || 0,
      stockValue: round(st.stockValue),
      stockUnits: st.units || 0,
      lowStockCount: lo.lowStockCount || 0,
      outOfStockCount: lo.outOfStockCount || 0,
    };
  });
  const total = rows.reduce(
    (acc, r) => ({
      salesTotal: round(acc.salesTotal + r.salesTotal),
      salesCount: acc.salesCount + r.salesCount,
      stockValue: round(acc.stockValue + r.stockValue),
      stockUnits: acc.stockUnits + r.stockUnits,
      lowStockCount: acc.lowStockCount + r.lowStockCount,
      outOfStockCount: acc.outOfStockCount + r.outOfStockCount,
    }),
    { salesTotal: 0, salesCount: 0, stockValue: 0, stockUnits: 0, lowStockCount: 0, outOfStockCount: 0 }
  );

  return res.status(200).json({
    success: true,
    organization: organization ? { _id: organization._id, name: organization.name } : null,
    from,
    to,
    branches: rows,
    total,
  });
};

module.exports = {
  getDestinations,
  listTransfers,
  getTransfer,
  getConsolidated,
};
