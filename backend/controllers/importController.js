// Bulk data import (#28): medicines and opening stock. Owner: Catalog agent.
//
// The client sends rows as JSON (parsed client-side from CSV, or by POST /api/import/parse
// for .xlsx files), in chunks of at most 500 rows (app.js JSON limit is 1mb).
// Each endpoint validates every row; with dryRun=true nothing is written and per-row
// results are returned. Without dryRun the chunk is committed in one transaction, and
// only if no row has an error (all-or-nothing per chunk).
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Medicine = require('../models/Medicine');
const StockBatch = require('../models/StockBatch');
const AppError = require('../utils/AppError');
const { audit } = require('../utils/audit');
const { recordMovement } = require('../utils/stockMovement');
const { recordControlledReceipt } = require('../services/clinical');
const { cleanCode } = require('../services/catalog');

const MAX_ROWS = 500;
const MAX_PARSE_ROWS = 10000;

// Header aliases -> canonical field names. Headers are compared lowercased with
// spaces, underscores, dashes and dots removed.
const ALIASES = {
  name: ['name', 'brandname', 'medicine', 'medicinename', 'productname', 'product'],
  genericName: ['genericname', 'generic', 'activesubstance'],
  category: ['category'],
  dosageForm: ['dosageform', 'form'],
  strength: ['strength'],
  price: ['price', 'sellingprice', 'retailprice', 'unitprice'],
  costPrice: ['costprice', 'cost', 'wholesaleprice'],
  minStockLevel: ['minstocklevel', 'minstock', 'reorderlevel'],
  requiresPrescription: ['requiresprescription', 'rx', 'prescription', 'rxonly'],
  barcode: ['barcode', 'ean', 'upc'],
  sku: ['sku', 'code', 'itemcode'],
  baseUnit: ['baseunit', 'unit'],
  batchNo: ['batchno', 'batch', 'batchnumber', 'lot', 'lotno'],
  quantity: ['quantity', 'qty', 'stock', 'openingstock'],
  expiryDate: ['expirydate', 'expiry', 'exp', 'expdate'],
  purchasePrice: ['purchaseprice', 'unitcost', 'buyprice'],
};
const HEADER_MAP = Object.entries(ALIASES).reduce((acc, [field, list]) => {
  list.forEach((a) => {
    acc[a] = field;
  });
  return acc;
}, {});
const normHeader = (h) => String(h || '').toLowerCase().replace(/[\s_\-.]/g, '');

// Maps a raw row object (any header spelling) to canonical fields.
const canonicalRow = (raw) => {
  const out = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    if (k === '_row') return;
    const field = HEADER_MAP[normHeader(k)];
    if (field && out[field] === undefined) out[field] = v;
  });
  return out;
};

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const isBlank = (v) => str(v) === '';
const toNumber = (v) => {
  if (isBlank(v)) return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const toBool = (v) => ['yes', 'y', 'true', '1', 'rx'].includes(str(v).toLowerCase());

// Accepts ISO / YYYY-MM-DD, DD/MM/YYYY (day first) and Excel serial numbers.
const parseDate = (v) => {
  const s = str(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getRows = (body) => {
  const { rows } = body || {};
  if (!Array.isArray(rows) || !rows.length) throw new AppError('Please provide rows to import', 400);
  if (rows.length > MAX_ROWS) throw new AppError(`Send at most ${MAX_ROWS} rows per request`, 400);
  return rows.map((raw, i) => ({
    rowNumber: Number.isInteger(raw?._row) ? raw._row : i + 2, // +2: header line + 1-based
    data: canonicalRow(raw),
  }));
};

const respond = (res, { dryRun, results, committed }) => {
  const summary = {
    total: results.length,
    valid: results.filter((r) => r.status === 'ok').length,
    errors: results.filter((r) => r.status === 'error').length,
    skipped: results.filter((r) => r.status === 'skip').length,
  };
  if (!dryRun && summary.errors) {
    return res.status(400).json({
      success: false,
      message: `${summary.errors} row(s) have errors; nothing was imported`,
      dryRun,
      committed: 0,
      summary,
      results,
    });
  }
  return res.status(200).json({ success: true, dryRun, committed: committed || 0, summary, results });
};

// @route POST /api/import/parse  body: { fileName, data: base64 }   (data:import)
// Parses the first worksheet of an .xlsx file into { headers, rows } (row objects
// keyed by the header row, each with `_row` = spreadsheet line number).
const parseFile = async (req, res) => {
  const { fileName, data } = req.body || {};
  if (typeof data !== 'string' || !data) throw new AppError('Please provide the file content', 400);
  if (!/\.xlsx$/i.test(String(fileName || ''))) {
    throw new AppError('Only .xlsx files are parsed on the server; CSV files are read in the browser', 400);
  }
  const buffer = Buffer.from(data, 'base64');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new AppError('Could not read this Excel file', 400);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError('The workbook has no worksheet', 400);

  const cellValue = (cell) => {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      if (v.text !== undefined) return String(v.text);
      if (v.result !== undefined) return v.result instanceof Date ? v.result.toISOString().slice(0, 10) : String(v.result);
      if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
      return '';
    }
    return String(v);
  };

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellValue(cell).trim();
  });
  if (!headers.filter(Boolean).length) throw new AppError('The first row must contain column headers', 400);

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const obj = { _row: r };
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = cellValue(row.getCell(col)).trim();
      if (v) any = true;
      obj[h] = v;
    });
    if (any) rows.push(obj);
    if (rows.length > MAX_PARSE_ROWS) throw new AppError(`At most ${MAX_PARSE_ROWS} rows can be imported at once`, 400);
  }
  return res.status(200).json({ success: true, headers: headers.filter(Boolean), rows });
};

// @route POST /api/import/medicines  body: { rows: [...], dryRun }   (data:import)
// Medicines whose name already exists are skipped (status 'skip'), never updated.
const importMedicines = async (req, res) => {
  const rows = getRows(req.body);
  const dryRun = req.body.dryRun !== false;

  const existing = await Medicine.find({ pharmacyId: req.pharmacyId }).select('name barcode sku packUnits.barcode');
  const existingNames = new Set(existing.map((m) => m.name.toLowerCase()));
  const usedCodes = new Set();
  const usedSkus = new Set();
  existing.forEach((m) => {
    if (m.barcode) usedCodes.add(m.barcode);
    (m.packUnits || []).forEach((p) => p.barcode && usedCodes.add(p.barcode));
    if (m.sku) usedSkus.add(m.sku.toLowerCase());
  });
  const fileNames = new Set();
  const forms = Medicine.DOSAGE_FORMS;

  const results = rows.map(({ rowNumber, data }) => {
    const errors = [];
    const name = str(data.name);
    const result = { row: rowNumber, name, status: 'ok', errors };
    if (!name) errors.push('Name is required');
    if (name.length > 200) errors.push('Name is too long');
    const category = str(data.category);
    if (!category) errors.push('Category is required');
    const price = toNumber(data.price);
    if (price === null) errors.push('Price is required');
    else if (Number.isNaN(price) || price < 0) errors.push('Price must be a non-negative number');
    const costPrice = toNumber(data.costPrice);
    if (Number.isNaN(costPrice) || (costPrice !== null && costPrice < 0)) {
      errors.push('Cost price must be a non-negative number');
    }
    const minStock = toNumber(data.minStockLevel);
    if (Number.isNaN(minStock) || (minStock !== null && (minStock < 0 || !Number.isInteger(minStock)))) {
      errors.push('Min stock level must be a whole number of 0 or more');
    }
    let dosageForm = 'Tablet';
    if (!isBlank(data.dosageForm)) {
      dosageForm = forms.find((f) => f.toLowerCase() === str(data.dosageForm).toLowerCase());
      if (!dosageForm) errors.push(`Dosage form must be one of: ${forms.join(', ')}`);
    }
    const barcode = cleanCode(data.barcode);
    const sku = cleanCode(data.sku);

    const key = name.toLowerCase();
    if (name && fileNames.has(key)) errors.push('Duplicate name in this file');
    if (name && existingNames.has(key)) {
      if (!errors.length) {
        result.status = 'skip';
        result.message = 'Already in the catalog (skipped)';
        return result;
      }
    }
    if (barcode && usedCodes.has(barcode)) errors.push(`Barcode ${barcode} is already used`);
    if (sku && usedSkus.has(sku.toLowerCase())) errors.push(`SKU ${sku} is already used`);

    if (errors.length) {
      result.status = 'error';
      return result;
    }
    fileNames.add(key);
    if (barcode) usedCodes.add(barcode);
    if (sku) usedSkus.add(sku.toLowerCase());
    result.doc = {
      pharmacyId: req.pharmacyId,
      name,
      genericName: str(data.genericName),
      category,
      dosageForm,
      strength: str(data.strength),
      price,
      costPrice: costPrice ?? 0,
      minStockLevel: minStock ?? 10,
      requiresPrescription: toBool(data.requiresPrescription),
      barcode: barcode || undefined,
      sku,
      baseUnit: str(data.baseUnit) || 'unit',
    };
    return result;
  });

  let committed = 0;
  const hasErrors = results.some((r) => r.status === 'error');
  if (!dryRun && !hasErrors) {
    const docs = results.filter((r) => r.status === 'ok').map((r) => r.doc);
    if (docs.length) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const created = await Medicine.insertMany(docs, { session });
          committed = created.length;
          await audit(
            req,
            { action: 'import.medicines', entity: 'Medicine', meta: { created: committed, rows: rows.length } },
            { session }
          );
        });
      } finally {
        await session.endSession();
      }
    }
  }
  results.forEach((r) => delete r.doc);
  return respond(res, { dryRun, results, committed });
};

// @route POST /api/import/opening-stock  body: { rows: [...], dryRun }   (data:import)
// Each row: medicine name or barcode or sku, batchNo, quantity (base units), expiryDate, purchasePrice?
// A batch number that already exists for the medicine is an error (prevents double imports).
const importOpeningStock = async (req, res) => {
  const rows = getRows(req.body);
  const dryRun = req.body.dryRun !== false;

  const medicines = await Medicine.find({ pharmacyId: req.pharmacyId, isArchived: { $ne: true } }).select(
    'name barcode sku packUnits.barcode costPrice'
  );
  const byName = new Map();
  const byCode = new Map();
  const bySku = new Map();
  medicines.forEach((m) => {
    byName.set(m.name.toLowerCase(), m);
    if (m.barcode) byCode.set(m.barcode, m);
    if (m.sku) bySku.set(m.sku.toLowerCase(), m);
  });

  const existingBatches = await StockBatch.find({ pharmacyId: req.pharmacyId }).select('medicineId batchNo');
  const batchKeys = new Set(existingBatches.map((b) => `${b.medicineId}|${b.batchNo.toLowerCase()}`));
  const now = new Date();

  const results = rows.map(({ rowNumber, data }) => {
    const errors = [];
    const result = { row: rowNumber, name: str(data.name) || str(data.barcode) || str(data.sku), status: 'ok', errors };
    let medicine = null;
    if (!isBlank(data.barcode)) medicine = byCode.get(cleanCode(data.barcode)) || null;
    if (!medicine && !isBlank(data.sku)) medicine = bySku.get(str(data.sku).toLowerCase()) || null;
    if (!medicine && !isBlank(data.name)) medicine = byName.get(str(data.name).toLowerCase()) || null;
    if (!medicine) errors.push('Medicine not found in the catalog (match by barcode, SKU or exact name)');
    else result.name = medicine.name;

    const batchNo = str(data.batchNo);
    if (!batchNo) errors.push('Batch number is required');
    const qty = toNumber(data.quantity);
    if (qty === null || Number.isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
      errors.push('Quantity must be a positive whole number');
    }
    const expiry = parseDate(data.expiryDate);
    if (!expiry) errors.push('Expiry date is missing or invalid (use YYYY-MM-DD)');
    else if (expiry <= now) errors.push('Expiry date must be in the future');
    const purchasePrice = toNumber(data.purchasePrice);
    if (Number.isNaN(purchasePrice) || (purchasePrice !== null && purchasePrice < 0)) {
      errors.push('Purchase price must be a non-negative number');
    }

    if (medicine && batchNo) {
      const key = `${medicine._id}|${batchNo.toLowerCase()}`;
      if (batchKeys.has(key)) errors.push(`Batch ${batchNo} already exists for this medicine (or is repeated in the file)`);
      else if (!errors.length) batchKeys.add(key);
    }

    if (errors.length) {
      result.status = 'error';
      return result;
    }
    result.doc = {
      pharmacyId: req.pharmacyId,
      medicineId: medicine._id,
      batchNo,
      quantity: qty,
      initialQuantity: qty,
      expiryDate: expiry,
      purchasePrice: purchasePrice ?? medicine.costPrice ?? 0,
      status: 'active',
    };
    return result;
  });

  let committed = 0;
  const hasErrors = results.some((r) => r.status === 'error');
  if (!dryRun && !hasErrors) {
    const docs = results.filter((r) => r.status === 'ok').map((r) => r.doc);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        committed = 0;
        const batches = await StockBatch.insertMany(docs, { session });
        for (const batch of batches) {
          // eslint-disable-next-line no-await-in-loop
          await recordMovement(
            {
              pharmacyId: req.pharmacyId,
              batchId: batch._id,
              medicineId: batch.medicineId,
              type: 'stock_in',
              quantityChange: batch.quantity,
              balanceAfter: batch.quantity,
              reason: 'Opening stock import',
              userId: req.user?._id,
            },
            { session }
          );
          // eslint-disable-next-line no-await-in-loop
          await recordControlledReceipt(
            {
              pharmacyId: req.pharmacyId,
              medicineId: batch.medicineId,
              batchId: batch._id,
              quantity: batch.quantity,
              userId: req.user?._id,
              refId: batch._id,
            },
            { session }
          );
        }
        committed = batches.length;
        await audit(
          req,
          {
            action: 'import.opening_stock',
            entity: 'StockBatch',
            meta: { created: committed, units: batches.reduce((s, b) => s + b.quantity, 0) },
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
  }
  results.forEach((r) => delete r.doc);
  return respond(res, { dryRun, results, committed });
};

module.exports = { parseFile, importMedicines, importOpeningStock, MAX_ROWS };
