// Data export (#20). Owner: Insights agent.
// GET /api/export/:entity?format=xlsx|csv&from=YYYY-MM-DD&to=YYYY-MM-DD (or &range=...)
// Streams an Excel workbook (exceljs streaming writer) or CSV, tenant-scoped.
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const Sale = require('../models/Sale');
const PurchaseOrder = require('../models/PurchaseOrder');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { parseRange } = require('./reportController');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const getOptionalModel = (name, file) => {
  if (mongoose.models[name]) return mongoose.models[name];
  try {
    return require(file);
  } catch {
    return null;
  }
};

const dateFilter = (range) => {
  if (range.range === 'all') return {};
  return { createdAt: { $gte: range.from, $lt: range.to } };
};

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const dt = (v) => (v ? new Date(v) : null);

// Each entity: sheets: [{ name, columns, cursor(pharmacyId, range), map(doc) -> row | row[] }]
const ENTITIES = {
  medicines: {
    sheets: [
      {
        name: 'Medicines',
        columns: [
          { header: 'Name', key: 'name', width: 28 },
          { header: 'Generic name', key: 'genericName', width: 24 },
          { header: 'Category', key: 'category', width: 18 },
          { header: 'Dosage form', key: 'dosageForm', width: 12 },
          { header: 'Strength', key: 'strength', width: 12 },
          { header: 'Barcode', key: 'barcode', width: 16 },
          { header: 'SKU', key: 'sku', width: 12 },
          { header: 'Base unit', key: 'baseUnit', width: 10 },
          { header: 'Price', key: 'price', width: 10 },
          { header: 'Cost price', key: 'costPrice', width: 10 },
          { header: 'Min stock', key: 'minStockLevel', width: 10 },
          { header: 'Prescription', key: 'requiresPrescription', width: 12 },
          { header: 'Tax exempt', key: 'taxExempt', width: 10 },
          { header: 'Controlled', key: 'isControlled', width: 10 },
          { header: 'Archived', key: 'isArchived', width: 10 },
        ],
        cursor: (pharmacyId) => Medicine.find({ pharmacyId }).sort({ name: 1 }).lean().cursor(),
        map: (m) => ({
          ...m,
          barcode: m.barcode || '',
          price: num(m.price),
          costPrice: num(m.costPrice),
          requiresPrescription: m.requiresPrescription ? 'Yes' : 'No',
          taxExempt: m.taxExempt ? 'Yes' : 'No',
          isControlled: m.isControlled ? 'Yes' : 'No',
          isArchived: m.isArchived ? 'Yes' : 'No',
        }),
      },
    ],
  },
  stock: {
    sheets: [
      {
        name: 'Stock batches',
        columns: [
          { header: 'Medicine', key: 'medicine', width: 28 },
          { header: 'Batch no', key: 'batchNo', width: 16 },
          { header: 'Quantity', key: 'quantity', width: 10 },
          { header: 'Initial qty', key: 'initialQuantity', width: 10 },
          { header: 'Expiry date', key: 'expiryDate', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
          { header: 'Purchase price', key: 'purchasePrice', width: 12 },
          { header: 'Stock value', key: 'value', width: 12 },
          { header: 'Status', key: 'status', width: 10 },
          { header: 'Received', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
        ],
        cursor: (pharmacyId, range) =>
          StockBatch.find({ pharmacyId, ...dateFilter(range) })
            .sort({ expiryDate: 1 })
            .populate('medicineId', 'name')
            .lean()
            .cursor(),
        map: (b) => ({
          medicine: b.medicineId?.name || '',
          batchNo: b.batchNo,
          quantity: b.quantity,
          initialQuantity: b.initialQuantity,
          expiryDate: dt(b.expiryDate),
          purchasePrice: num(b.purchasePrice),
          value: Number(((b.quantity || 0) * (b.purchasePrice || 0)).toFixed(2)),
          status: b.status,
          createdAt: dt(b.createdAt),
        }),
      },
    ],
  },
  sales: {
    sheets: [
      {
        name: 'Sales',
        columns: [
          { header: 'Invoice', key: 'invoiceNumber', width: 18 },
          { header: 'Date', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
          { header: 'Customer', key: 'customer', width: 22 },
          { header: 'Phone', key: 'phone', width: 14 },
          { header: 'Staff', key: 'staff', width: 18 },
          { header: 'Items', key: 'items', width: 8 },
          { header: 'Subtotal', key: 'subtotal', width: 11 },
          { header: 'Discount', key: 'discount', width: 10 },
          { header: 'Tax', key: 'tax', width: 10 },
          { header: 'Grand total', key: 'grandTotal', width: 12 },
          { header: 'Payment', key: 'paymentMethod', width: 14 },
          { header: 'Amount paid', key: 'amountPaid', width: 12 },
          { header: 'Balance due', key: 'balanceDue', width: 12 },
          { header: 'Return status', key: 'returnStatus', width: 12 },
          { header: 'Voided', key: 'voided', width: 8 },
        ],
        cursor: (pharmacyId, range) =>
          Sale.find({ pharmacyId, ...dateFilter(range) })
            .sort({ createdAt: -1 })
            .populate('staffId', 'name')
            .populate('pharmacistId', 'name')
            .lean()
            .cursor(),
        map: (s) => ({
          invoiceNumber: s.invoiceNumber,
          createdAt: dt(s.createdAt),
          customer: s.customer?.name || '',
          phone: s.customer?.phone || '',
          staff: s.staffId?.name || s.pharmacistId?.name || '',
          items: (s.items || []).length,
          subtotal: num(s.subtotal),
          discount: num(s.discount),
          tax: num(s.tax),
          grandTotal: num(s.grandTotal),
          paymentMethod: s.payments?.length > 1 ? s.payments.map((p) => p.method).join('+') : s.paymentMethod,
          amountPaid: num(s.amountPaid ?? s.grandTotal),
          balanceDue: num(s.balanceDue || 0),
          returnStatus: s.returnStatus || 'none',
          voided: s.voided ? 'Yes' : 'No',
        }),
      },
      {
        name: 'Sale items',
        columns: [
          { header: 'Invoice', key: 'invoiceNumber', width: 18 },
          { header: 'Date', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
          { header: 'Medicine', key: 'name', width: 28 },
          { header: 'Batch', key: 'batchNo', width: 14 },
          { header: 'Quantity', key: 'quantity', width: 10 },
          { header: 'Unit', key: 'unitName', width: 10 },
          { header: 'Unit price', key: 'unitPrice', width: 10 },
          { header: 'Subtotal', key: 'subtotal', width: 11 },
          { header: 'Tax', key: 'taxAmount', width: 10 },
          { header: 'Cost price', key: 'costPrice', width: 10 },
          { header: 'Voided', key: 'voided', width: 8 },
        ],
        cursor: (pharmacyId, range) =>
          Sale.find({ pharmacyId, ...dateFilter(range) })
            .sort({ createdAt: -1 })
            .select('invoiceNumber createdAt items voided')
            .lean()
            .cursor(),
        map: (s) =>
          (s.items || []).map((it) => ({
            invoiceNumber: s.invoiceNumber,
            createdAt: dt(s.createdAt),
            name: it.name,
            batchNo: it.batchNo,
            quantity: it.quantity,
            unitName: it.unitName || 'unit',
            unitPrice: num(it.unitPrice),
            subtotal: num(it.subtotal),
            taxAmount: num(it.taxAmount || 0),
            costPrice: num(it.costPrice),
            voided: s.voided ? 'Yes' : 'No',
          })),
      },
    ],
  },
  'purchase-orders': {
    sheets: [
      {
        name: 'Purchase orders',
        columns: [
          { header: 'PO number', key: 'poNumber', width: 18 },
          { header: 'Supplier', key: 'supplier', width: 24 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Order date', key: 'orderDate', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
          { header: 'Expected', key: 'expectedDelivery', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
          { header: 'Received', key: 'receivedDate', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
          { header: 'Items', key: 'items', width: 8 },
          { header: 'Total', key: 'totalAmount', width: 12 },
          { header: 'Notes', key: 'notes', width: 30 },
        ],
        cursor: (pharmacyId, range) =>
          PurchaseOrder.find({ pharmacyId, ...dateFilter(range) })
            .sort({ createdAt: -1 })
            .populate('supplierId', 'name')
            .lean()
            .cursor(),
        map: (po) => ({
          poNumber: po.poNumber,
          supplier: po.supplierId?.name || '',
          status: po.status,
          orderDate: dt(po.orderDate || po.createdAt),
          expectedDelivery: dt(po.expectedDelivery),
          receivedDate: dt(po.receivedDate),
          items: (po.items || []).length,
          totalAmount: num(po.totalAmount),
          notes: po.notes || '',
        }),
      },
    ],
  },
  customers: {
    optionalModel: ['Customer', '../models/Customer'],
    sheets: [
      {
        name: 'Customers',
        columns: [
          { header: 'Name', key: 'name', width: 26 },
          { header: 'Phone', key: 'phone', width: 16 },
          { header: 'Credit limit', key: 'creditLimit', width: 12 },
          { header: 'Balance', key: 'balance', width: 12 },
          { header: 'Active', key: 'active', width: 8 },
          { header: 'Created', key: 'createdAt', width: 18, style: { numFmt: 'yyyy-mm-dd' } },
        ],
        cursor: (pharmacyId, range, Model) => Model.find({ pharmacyId, ...dateFilter(range) }).sort({ name: 1 }).lean().cursor(),
        map: (c) => ({
          name: c.name,
          phone: c.phone || '',
          creditLimit: c.creditLimit === null || c.creditLimit === undefined ? 'Unlimited' : num(c.creditLimit),
          balance: num(c.balance || 0),
          active: c.active === false ? 'No' : 'Yes',
          createdAt: dt(c.createdAt),
        }),
      },
    ],
  },
};

const EXPORT_ENTITIES = Object.keys(ENTITIES);

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralize spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const xlsxSafe = (row) => {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    out[k] = typeof v === 'string' && /^[=+\-@]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
  });
  return out;
};

// @desc    Export an entity as an Excel workbook (default) or CSV
// @route   GET /api/export/:entity?format=xlsx|csv&from&to
// @access  Private (data:export)
const exportEntity = async (req, res) => {
  const entityName = req.params.entity;
  const def = ENTITIES[entityName];
  if (!def) throw new AppError(`Unknown export "${entityName}". Available: ${EXPORT_ENTITIES.join(', ')}`, 404);
  if (!req.pharmacyId) throw new AppError('Select a pharmacy to export from', 400);

  const format = (req.query.format || 'xlsx').toString().toLowerCase();
  if (!['xlsx', 'csv'].includes(format)) throw new AppError('format must be xlsx or csv', 400);

  let Model = null;
  if (def.optionalModel) {
    Model = getOptionalModel(...def.optionalModel);
    if (!Model) throw new AppError(`${entityName} export is not available yet`, 404);
  }

  const range = parseRange(req, 'all');
  const pharmacyId = new mongoose.Types.ObjectId(String(req.pharmacyId));
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${entityName}-${stamp}.${format}`;

  await audit(req, { action: 'data.export', entity: entityName, meta: { format, range: range.range, from: range.from, to: range.to } });

  res.status(200);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (format === 'csv') {
      // CSV holds the first sheet only
      const sheet = def.sheets[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.write('﻿' + sheet.columns.map((c) => csvCell(c.header)).join(',') + '\n');
      for await (const doc of sheet.cursor(pharmacyId, range, Model)) {
        const mapped = sheet.map(doc);
        (Array.isArray(mapped) ? mapped : [mapped]).forEach((row) => {
          res.write(sheet.columns.map((c) => csvCell(row[c.key])).join(',') + '\n');
        });
      }
      return res.end();
    }

    res.setHeader('Content-Type', XLSX_TYPE);
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    workbook.creator = 'Pharmacy ERP';
    workbook.created = new Date();
    for (const sheet of def.sheets) {
      const ws = workbook.addWorksheet(sheet.name);
      ws.columns = sheet.columns;
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).commit();
      for await (const doc of sheet.cursor(pharmacyId, range, Model)) {
        const mapped = sheet.map(doc);
        (Array.isArray(mapped) ? mapped : [mapped]).forEach((row) => ws.addRow(xlsxSafe(row)).commit());
      }
      ws.commit();
    }
    await workbook.commit();
    return undefined;
  } catch (err) {
    if (!res.headersSent) throw err;
    if (process.env.NODE_ENV !== 'test') console.error('[export] stream failed:', err && err.message);
    res.destroy(err);
    return undefined;
  }
};

module.exports = { exportEntity, EXPORT_ENTITIES };
