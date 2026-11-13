// Accounts payable helpers (#10). Owner: Finance agent.
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const Supplier = require('../models/Supplier');
const SupplierInvoice = require('../models/SupplierInvoice');

const EPS = 0.005;
const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const invoiceStatus = (amount, amountPaid) => {
  if (amountPaid >= amount - EPS) return 'paid';
  if (amountPaid > EPS) return 'partial';
  return 'open';
};

const defaultDueDate = (invoiceDate, supplier) => {
  const days = Number.isFinite(Number(supplier?.paymentTermsDays)) ? Number(supplier.paymentTermsDays) : 30;
  return new Date(new Date(invoiceDate).getTime() + days * DAY_MS);
};

// Creates the supplier invoice for a received purchase order.
//   createSupplierInvoiceFromPO({ pharmacyId, purchaseOrder, invoiceNo?, invoiceDate?, amount?, dueDate?, userId? }, { session })
// - amount defaults to purchaseOrder.totalAmount (pass the received value for partial receipts)
// - invoiceNo defaults to the PO number (suffixed -2, -3... when the PO already has invoices)
// - dueDate defaults to invoiceDate + supplier.paymentTermsDays
// Returns the created SupplierInvoice.
const createSupplierInvoiceFromPO = async (
  { pharmacyId, purchaseOrder, invoiceNo, invoiceDate, amount, dueDate, userId },
  { session } = {}
) => {
  if (!purchaseOrder || !purchaseOrder.supplierId) throw new AppError('Purchase order is required', 400);
  const pid = new mongoose.Types.ObjectId(String(pharmacyId));
  const opt = session ? { session } : {};

  const supplierQuery = Supplier.findOne({ _id: purchaseOrder.supplierId, pharmacyId: pid });
  if (session) supplierQuery.session(session);
  const supplier = await supplierQuery;
  if (!supplier) throw new AppError('Supplier not found', 404);

  const value = round2(amount !== undefined && amount !== null ? amount : purchaseOrder.totalAmount);
  if (!(value > 0)) throw new AppError('Invoice amount must be positive', 400);

  let number = invoiceNo ? String(invoiceNo).trim() : '';
  if (!number) {
    const countQuery = SupplierInvoice.countDocuments({ pharmacyId: pid, purchaseOrderId: purchaseOrder._id });
    if (session) countQuery.session(session);
    const existing = await countQuery;
    number = existing > 0 ? `${purchaseOrder.poNumber}-${existing + 1}` : String(purchaseOrder.poNumber || '');
  }
  if (!number) throw new AppError('Invoice number is required', 400);

  const date = invoiceDate ? new Date(invoiceDate) : new Date();
  if (Number.isNaN(date.getTime())) throw new AppError('Invalid invoice date', 400);
  const due = dueDate ? new Date(dueDate) : defaultDueDate(date, supplier);
  if (Number.isNaN(due.getTime())) throw new AppError('Invalid due date', 400);

  const [invoice] = await SupplierInvoice.create(
    [
      {
        pharmacyId: pid,
        supplierId: supplier._id,
        purchaseOrderId: purchaseOrder._id,
        invoiceNo: number,
        invoiceDate: date,
        dueDate: due,
        amount: value,
        amountPaid: 0,
        status: 'open',
        createdBy: userId || null,
      },
    ],
    opt
  );
  return invoice;
};

module.exports = { createSupplierInvoiceFromPO, invoiceStatus, defaultDueDate, round2, EPS, DAY_MS };
