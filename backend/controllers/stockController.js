const StockBatch = require('../models/StockBatch');
const Medicine = require('../models/Medicine');

// @desc    Get all stock batches for logged-in pharmacy (FEFO ordered)
// @route   GET /api/stock
// @access  Private (Pharmacist only)
const getStockBatches = async (req, res) => {
  try {
    const { medicineId, status } = req.query;
    const query = { pharmacyId: req.pharmacyId };

    if (medicineId) {
      query.medicineId = medicineId;
    }

    if (status) {
      query.status = status;
    }

    const batches = await StockBatch.find(query)
      .populate('medicineId', 'name genericName category dosageForm strength price minStockLevel')
      .sort({ expiryDate: 1 });

    return res.status(200).json({
      success: true,
      count: batches.length,
      batches,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Add a new stock batch (Stock-In)
// @route   POST /api/stock
// @access  Private (Pharmacist only)
const addStockBatch = async (req, res) => {
  try {
    const { medicineId, batchNo, quantity, expiryDate, purchasePrice } = req.body;

    if (!medicineId || !batchNo || quantity === undefined || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide medicine, batch number, quantity, and expiry date',
      });
    }

    const medicine = await Medicine.findOne({
      _id: medicineId,
      pharmacyId: req.pharmacyId,
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found in your pharmacy catalog',
      });
    }

    let batch = await StockBatch.findOne({
      pharmacyId: req.pharmacyId,
      medicineId,
      batchNo: batchNo.trim(),
    });

    if (batch) {
      batch.quantity += Number(quantity);
      batch.initialQuantity += Number(quantity);
      if (purchasePrice !== undefined) batch.purchasePrice = Number(purchasePrice);
      if (batch.quantity > 0) batch.status = 'active';
      await batch.save();
    } else {
      batch = await StockBatch.create({
        pharmacyId: req.pharmacyId,
        medicineId,
        batchNo: batchNo.trim(),
        quantity: Number(quantity),
        initialQuantity: Number(quantity),
        expiryDate: new Date(expiryDate),
        purchasePrice: purchasePrice ? Number(purchasePrice) : 0,
        status: 'active',
      });
    }

    await batch.populate('medicineId', 'name genericName category dosageForm strength price');

    return res.status(201).json({
      success: true,
      message: 'Stock batch added successfully',
      batch,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Adjust stock (damaged, expired, or correction)
// @route   PATCH /api/stock/:id/adjust
// @access  Private (Pharmacist only)
const adjustStock = async (req, res) => {
  try {
    const { adjustmentType, reduceQty } = req.body;

    const batch = await StockBatch.findOne({
      _id: req.params.id,
      pharmacyId: req.pharmacyId,
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Stock batch not found',
      });
    }

    const qtyToReduce = Number(reduceQty);
    if (isNaN(qtyToReduce) || qtyToReduce <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid quantity to reduce',
      });
    }

    if (qtyToReduce > batch.quantity) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce more than current available quantity (${batch.quantity})`,
      });
    }

    batch.quantity -= qtyToReduce;

    if (batch.quantity === 0) {
      batch.status = adjustmentType === 'expired' ? 'expired' : 'depleted';
    }

    await batch.save();
    await batch.populate('medicineId', 'name genericName dosageForm strength');

    return res.status(200).json({
      success: true,
      message: `Stock adjusted successfully (${adjustmentType || 'correction'})`,
      batch,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get inventory summary, low stock, and expiring items
// @route   GET /api/stock/summary
// @access  Private (Pharmacist only)
const getInventorySummary = async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const activeBatches = await StockBatch.find({
      pharmacyId: req.pharmacyId,
      status: 'active',
      quantity: { $gt: 0 },
    }).populate('medicineId', 'name minStockLevel');

    const totalStockUnits = activeBatches.reduce((sum, b) => sum + b.quantity, 0);

    const expiringSoonBatches = activeBatches.filter(
      (b) => new Date(b.expiryDate) <= thirtyDaysFromNow
    );

    const medicines = await Medicine.find({ pharmacyId: req.pharmacyId });
    const lowStockMedicines = [];

    medicines.forEach((med) => {
      const medStock = activeBatches
        .filter((b) => b.medicineId?._id?.toString() === med._id.toString())
        .reduce((sum, b) => sum + b.quantity, 0);

      if (medStock <= med.minStockLevel) {
        lowStockMedicines.push({
          _id: med._id,
          name: med.name,
          currentStock: medStock,
          minStockLevel: med.minStockLevel,
        });
      }
    });

    return res.status(200).json({
      success: true,
      summary: {
        totalBatches: activeBatches.length,
        totalStockUnits,
        expiringSoonCount: expiringSoonBatches.length,
        expiringSoonBatches,
        lowStockCount: lowStockMedicines.length,
        lowStockMedicines,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete a stock batch
// @route   DELETE /api/stock/:id
// @access  Private (Pharmacist only)
const deleteStockBatch = async (req, res) => {
  try {
    const batch = await StockBatch.findOne({
      _id: req.params.id,
      pharmacyId: req.pharmacyId,
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Stock batch not found',
      });
    }

    await batch.deleteOne();

    return res.status(200).json({
      success: true,
      message: 'Stock batch deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getStockBatches,
  addStockBatch,
  adjustStock,
  getInventorySummary,
  deleteStockBatch,
};
