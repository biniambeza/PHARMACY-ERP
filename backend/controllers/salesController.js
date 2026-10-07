const Sale = require('../models/Sale');
const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');
const User = require('../models/User');
const Pharmacy = require('../models/Pharmacy');

// @desc    Process new sale with automatic FEFO stock batch deduction
// @route   POST /api/sales
// @access  Private (Pharmacist only)
const createSale = async (req, res) => {
  try {
    const { items, customer, discount = 0, tax = 0, paymentMethod = 'cash', notes = '' } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sale must contain at least one item',
      });
    }

    const saleItems = [];
    let subtotal = 0;

    // Process each item and deduct stock using FEFO (First-Expired, First-Out)
    for (const item of items) {
      const qtyRequested = Number(item.quantity);
      if (!item.medicineId || isNaN(qtyRequested) || qtyRequested <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item data provided',
        });
      }

      const medicine = await Medicine.findOne({
        _id: item.medicineId,
        pharmacyId: req.pharmacyId,
      });

      if (!medicine) {
        return res.status(404).json({
          success: false,
          message: `Medicine not found in your catalog`,
        });
      }

      // Fetch active batches sorted by earliest expiry date (FEFO)
      const batches = await StockBatch.find({
        pharmacyId: req.pharmacyId,
        medicineId: medicine._id,
        status: 'active',
        quantity: { $gt: 0 },
      }).sort({ expiryDate: 1 });

      const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
      if (totalAvailable < qtyRequested) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${medicine.name}". Requested: ${qtyRequested}, Available: ${totalAvailable}`,
        });
      }

      // Deduct from batches sequentially (FEFO)
      let remainingToDeduct = qtyRequested;
      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;

        const take = Math.min(batch.quantity, remainingToDeduct);
        batch.quantity -= take;
        if (batch.quantity === 0) {
          batch.status = 'depleted';
        }
        await batch.save();

        const itemSubtotal = Number((take * medicine.price).toFixed(2));
        subtotal += itemSubtotal;

        saleItems.push({
          medicineId: medicine._id,
          name: medicine.name,
          batchId: batch._id,
          batchNo: batch.batchNo,
          quantity: take,
          unitPrice: medicine.price,
          subtotal: itemSubtotal,
        });

        remainingToDeduct -= take;
      }
    }

    subtotal = Number(subtotal.toFixed(2));
    const discountVal = Number(discount) || 0;
    const taxVal = Number(tax) || 0;
    const grandTotal = Number(Math.max(0, subtotal - discountVal + taxVal).toFixed(2));

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const sale = await Sale.create({
      pharmacyId: req.pharmacyId,
      pharmacistId: req.user._id,
      invoiceNumber,
      customer: {
        name: customer?.name?.trim() || 'Walk-in Customer',
        phone: customer?.phone?.trim() || '',
      },
      items: saleItems,
      subtotal,
      discount: discountVal,
      tax: taxVal,
      grandTotal,
      paymentMethod,
      paymentStatus: 'paid',
      notes,
    });

    return res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      sale,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get sales history for logged-in pharmacy
// @route   GET /api/sales
// @access  Private (Pharmacist only)
const getSales = async (req, res) => {
  try {
    const { search, limit = 50, page = 1 } = req.query;
    const query = { pharmacyId: req.pharmacyId };

    if (search && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { invoiceNumber: { $regex: sanitized, $options: 'i' } },
        { 'customer.name': { $regex: sanitized, $options: 'i' } },
        { 'customer.phone': { $regex: sanitized, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const total = await Sale.countDocuments(query);
    const sales = await Sale.find(query)
      .populate('pharmacistId', 'name email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      sales: sales || [],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single sale details
// @route   GET /api/sales/:id
// @access  Private (Pharmacist only)
const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      _id: req.params.id,
      pharmacyId: req.pharmacyId,
    })
      .populate('pharmacistId', 'name email')
      .populate('items.medicineId', 'name genericName category dosageForm strength');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale transaction not found',
      });
    }

    return res.status(200).json({
      success: true,
      sale,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get sales statistics for dashboard
// @route   GET /api/sales/summary
// @access  Private (Pharmacist only)
const getSalesSummary = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const allSales = await Sale.find({ pharmacyId: req.pharmacyId });
    const todaySales = allSales.filter((s) => new Date(s.createdAt) >= startOfToday);

    const todayRevenue = todaySales.reduce((sum, s) => sum + (Number(s.grandTotal) || 0), 0);
    const totalRevenue = allSales.reduce((sum, s) => sum + (Number(s.grandTotal) || 0), 0);

    return res.status(200).json({
      success: true,
      summary: {
        todaySalesCount: todaySales.length,
        todayRevenue: Number(todayRevenue.toFixed(2)),
        totalSalesCount: allSales.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
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
  createSale,
  getSales,
  getSaleById,
  getSalesSummary,
};
