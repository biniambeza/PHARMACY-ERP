const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');

// @desc    Get all purchase orders for logged-in pharmacy
// @route   GET /api/procurement/orders
// @access  Private (Pharmacist only)
const getPurchaseOrders = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = { pharmacyId: req.pharmacyId };

    if (status) {
      query.status = status;
    }

    if (search) {
      query.poNumber = { $regex: search, $options: 'i' };
    }

    const orders = await PurchaseOrder.find(query)
      .populate('supplierId', 'name contactPerson phone email')
      .populate('pharmacistId', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single purchase order
// @route   GET /api/procurement/orders/:id
// @access  Private (Pharmacist only)
const getPurchaseOrderById = async (req, res) => {
  try {
    const order = await PurchaseOrder.findOne({
      _id: req.params.id,
      pharmacyId: req.pharmacyId,
    })
      .populate('supplierId', 'name contactPerson phone email address')
      .populate('pharmacistId', 'name email')
      .populate('items.medicineId', 'name genericName category dosageForm strength');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found',
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Create new purchase order
// @route   POST /api/procurement/orders
// @access  Private (Pharmacist only)
const createPurchaseOrder = async (req, res) => {
  try {
    const { supplierId, items, expectedDelivery, notes } = req.body;

    if (!supplierId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide supplier and at least one item',
      });
    }

    const supplier = await Supplier.findOne({
      _id: supplierId,
      pharmacyId: req.pharmacyId,
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found in your pharmacy records',
      });
    }

    const poItems = [];
    let totalAmount = 0;

    for (const it of items) {
      const med = await Medicine.findOne({
        _id: it.medicineId,
        pharmacyId: req.pharmacyId,
      });

      if (!med) {
        return res.status(404).json({
          success: false,
          message: 'One or more medicines not found in catalog',
        });
      }

      const qty = Number(it.quantityOrdered);
      const cost = Number(it.unitCost);

      if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item quantity or cost provided',
        });
      }

      const subtotal = Number((qty * cost).toFixed(2));
      totalAmount += subtotal;

      poItems.push({
        medicineId: med._id,
        name: med.name,
        quantityOrdered: qty,
        unitCost: cost,
        subtotal,
      });
    }

    const poNumber = `PO-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const order = await PurchaseOrder.create({
      pharmacyId: req.pharmacyId,
      pharmacistId: req.user._id,
      supplierId,
      poNumber,
      items: poItems,
      totalAmount: Number(totalAmount.toFixed(2)),
      status: 'ordered',
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
      notes: notes || '',
    });

    await order.populate('supplierId', 'name contactPerson phone');

    return res.status(201).json({
      success: true,
      message: 'Purchase order created successfully',
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Receive purchase order and automatically create stock batches (Stock-In)
// @route   PATCH /api/procurement/orders/:id/receive
// @access  Private (Pharmacist only)
const receivePurchaseOrder = async (req, res) => {
  try {
    const { batchDetails } = req.body; // array of { medicineId, batchNo, expiryDate }

    const order = await PurchaseOrder.findOne({
      _id: req.params.id,
      pharmacyId: req.pharmacyId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found',
      });
    }

    if (order.status !== 'ordered') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be received because it is already ${order.status}`,
      });
    }

    if (!batchDetails || !Array.isArray(batchDetails)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide batch number and expiration date for each received item',
      });
    }

    // Process each item and add to StockBatch
    for (const item of order.items) {
      const batchInfo = batchDetails.find(
        (b) => b.medicineId.toString() === item.medicineId.toString()
      );

      if (!batchInfo || !batchInfo.batchNo || !batchInfo.expiryDate) {
        return res.status(400).json({
          success: false,
          message: `Missing batch number or expiry date for "${item.name}"`,
        });
      }

      // Check if this batch already exists for this medicine in this pharmacy
      let batch = await StockBatch.findOne({
        pharmacyId: req.pharmacyId,
        medicineId: item.medicineId,
        batchNo: batchInfo.batchNo.trim(),
      });

      if (batch) {
        batch.quantity += item.quantityOrdered;
        batch.initialQuantity += item.quantityOrdered;
        batch.purchasePrice = item.unitCost;
        if (batch.quantity > 0) batch.status = 'active';
        await batch.save();
      } else {
        await StockBatch.create({
          pharmacyId: req.pharmacyId,
          medicineId: item.medicineId,
          batchNo: batchInfo.batchNo.trim(),
          quantity: item.quantityOrdered,
          initialQuantity: item.quantityOrdered,
          expiryDate: new Date(batchInfo.expiryDate),
          purchasePrice: item.unitCost,
          status: 'active',
        });
      }
    }

    order.status = 'received';
    order.receivedDate = new Date();
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Purchase order received and inventory stock batches updated successfully',
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Cancel purchase order
// @route   PATCH /api/procurement/orders/:id/cancel
// @access  Private (Pharmacist only)
const cancelPurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findOne({
      _id: req.params.id,
      pharmacyId: req.pharmacyId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Purchase order not found',
      });
    }

    if (order.status !== 'ordered') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an order that is already ${order.status}`,
      });
    }

    order.status = 'cancelled';
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Purchase order cancelled successfully',
      order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
};
