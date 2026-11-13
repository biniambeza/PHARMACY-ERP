// Catalog helpers shared by the medicine, import and stock controllers (#3, #13, #14).
// Owner: Catalog agent.
const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const PriceHistory = require('../models/PriceHistory');
const AppError = require('../utils/AppError');
const escapeRegex = require('../utils/escapeRegex');
const { nextSequence } = require('../utils/sequence');

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const cleanCode = (v) => {
  if (v === undefined || v === null) return '';
  return String(v).trim();
};

// Validates and normalises a packUnits array from user input.
// Rules: name required and unique (case-insensitive, also != baseUnit),
// factor integer >= 2, price >= 0 or null, barcode optional and unique within the medicine.
// Throws AppError(400) with a readable message.
const normalizePackUnits = (input, { baseUnit = 'unit' } = {}) => {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new AppError('packUnits must be an array', 400);
  if (input.length > 10) throw new AppError('A medicine can have at most 10 pack units', 400);

  const seen = new Set([String(baseUnit || 'unit').trim().toLowerCase()]);
  return input.map((raw, i) => {
    const label = `Pack unit #${i + 1}`;
    if (!raw || typeof raw !== 'object') throw new AppError(`${label} is invalid`, 400);
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) throw new AppError(`${label}: name is required`, 400);
    if (name.length > 40) throw new AppError(`${label}: name is too long`, 400);
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new AppError(`Pack unit name "${name}" is duplicated or equals the base unit`, 400);
    }
    seen.add(key);

    const factor = Number(raw.factor);
    if (!Number.isInteger(factor) || factor < 2) {
      throw new AppError(`Pack unit "${name}": factor must be a whole number of at least 2`, 400);
    }

    let price = null;
    if (raw.price !== undefined && raw.price !== null && raw.price !== '') {
      price = Number(raw.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new AppError(`Pack unit "${name}": price must be a non-negative number`, 400);
      }
      price = round2(price);
    }

    const barcode = cleanCode(raw.barcode);
    const unit = { name, factor, price };
    if (barcode) unit.barcode = barcode;
    if (raw._id && mongoose.isValidObjectId(raw._id)) unit._id = raw._id;
    return unit;
  });
};

// Collects every barcode used by a medicine (main + packs) and checks they are
// distinct within the medicine.
const collectCodes = ({ barcode, packUnits = [] }) => {
  const codes = [];
  if (cleanCode(barcode)) codes.push(cleanCode(barcode));
  packUnits.forEach((p) => {
    if (cleanCode(p.barcode)) codes.push(cleanCode(p.barcode));
  });
  const unique = new Set(codes);
  if (unique.size !== codes.length) {
    throw new AppError('The same barcode is used more than once on this medicine', 400);
  }
  return codes;
};

// Throws 409 when a barcode (main or pack) or the SKU is already used by another
// medicine of the pharmacy (archived medicines included: barcodes stay reserved).
const assertCodesAvailable = async ({ pharmacyId, excludeId, barcode, packUnits, sku }, { session } = {}) => {
  const codes = collectCodes({ barcode, packUnits });
  const base = { pharmacyId };
  if (excludeId) base._id = { $ne: excludeId };

  if (codes.length) {
    const clash = await Medicine.findOne({
      ...base,
      $or: [{ barcode: { $in: codes } }, { 'packUnits.barcode': { $in: codes } }],
    })
      .select('name barcode packUnits.barcode')
      .session(session || null);
    if (clash) {
      const used = codes.find(
        (c) => clash.barcode === c || (clash.packUnits || []).some((p) => p.barcode === c)
      );
      throw new AppError(`Barcode ${used || codes[0]} is already used by "${clash.name}"`, 409);
    }
  }

  const skuValue = cleanCode(sku);
  if (skuValue) {
    const clash = await Medicine.findOne({
      ...base,
      sku: new RegExp(`^${escapeRegex(skuValue)}$`, 'i'),
    })
      .select('name')
      .session(session || null);
    if (clash) throw new AppError(`SKU ${skuValue} is already used by "${clash.name}"`, 409);
  }
};

// Margin as a share of the selling price: (price - cost) / price * 100.
// Returns 'below_cost' | 'below_min_margin' | null. No warning when cost is unknown (0).
const marginWarning = ({ price, costPrice, minMarginPercent }) => {
  const p = Number(price) || 0;
  const c = Number(costPrice) || 0;
  if (c <= 0) return null;
  if (p < c) return 'below_cost';
  if (minMarginPercent !== null && minMarginPercent !== undefined && minMarginPercent !== '') {
    const min = Number(minMarginPercent);
    if (Number.isFinite(min) && p > 0 && ((p - c) / p) * 100 < min) return 'below_min_margin';
  }
  return null;
};

const marginPercent = ({ price, costPrice }) => {
  const p = Number(price) || 0;
  const c = Number(costPrice) || 0;
  if (p <= 0) return null;
  return round2(((p - c) / p) * 100);
};

// Adds computed margin fields to a medicine document for API responses.
const withMargin = (medicine) => {
  const obj = typeof medicine.toObject === 'function' ? medicine.toObject() : { ...medicine };
  obj.marginPercent = marginPercent(obj);
  obj.marginWarning = marginWarning(obj);
  return obj;
};

// Compares old and new price fields and returns PriceHistory rows (not saved).
const diffPrices = (before, after) => {
  const rows = [];
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  ['price', 'costPrice'].forEach((field) => {
    const o = num(before[field]);
    const n = num(after[field]);
    if (o !== n) rows.push({ field, old: o, new: n, unitName: '' });
  });
  const oldPacks = new Map((before.packUnits || []).map((p) => [String(p.name).toLowerCase(), p]));
  const newPacks = new Map((after.packUnits || []).map((p) => [String(p.name).toLowerCase(), p]));
  newPacks.forEach((p, key) => {
    const o = oldPacks.has(key) ? num(oldPacks.get(key).price) : null;
    const n = num(p.price);
    if (o !== n) rows.push({ field: 'packPrice', unitName: p.name, old: o, new: n });
  });
  oldPacks.forEach((p, key) => {
    if (!newPacks.has(key) && num(p.price) !== null) {
      rows.push({ field: 'packPrice', unitName: p.name, old: num(p.price), new: null });
    }
  });
  return rows;
};

const recordPriceHistory = async (rows, { session } = {}) => {
  if (!rows.length) return [];
  return PriceHistory.insertMany(rows, session ? { session } : {});
};

// ---------- Barcodes ----------

// EAN-13 check digit for a 12-digit string.
const ean13CheckDigit = (digits12) => {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const d = Number(digits12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return String((10 - (sum % 10)) % 10);
};

// Internal (in-store) EAN-13: '2' + 11-digit pharmacy-scoped sequence + check digit.
// The '2' prefix is the GS1 range reserved for restricted / in-store numbering.
const generateInternalBarcode = async (pharmacyId, { session } = {}) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const seq = await nextSequence(pharmacyId, 'BARCODE', { session });
    const body = `2${String(seq).padStart(11, '0')}`;
    const code = body + ean13CheckDigit(body);
    // eslint-disable-next-line no-await-in-loop
    const taken = await Medicine.exists({
      pharmacyId,
      $or: [{ barcode: code }, { 'packUnits.barcode': code }],
    }).session(session || null);
    if (!taken) return code;
  }
  throw new AppError('Could not generate a unique barcode, please retry', 409);
};

// Finds a medicine by scanned/typed code. Order: main barcode, pack barcode, SKU.
// Returns { medicine, unit: { name, factor, price } } or null.
const lookupByCode = async (pharmacyId, rawCode) => {
  const code = cleanCode(rawCode);
  if (!code) return null;
  const base = { pharmacyId, isArchived: { $ne: true } };

  let medicine = await Medicine.findOne({ ...base, barcode: code });
  if (medicine) {
    return { medicine, unit: { name: medicine.baseUnit || 'unit', factor: 1, price: medicine.price } };
  }

  medicine = await Medicine.findOne({ ...base, 'packUnits.barcode': code });
  if (medicine) {
    const pack = medicine.packUnits.find((p) => p.barcode === code);
    const price = pack.price !== null && pack.price !== undefined ? pack.price : round2(medicine.price * pack.factor);
    return { medicine, unit: { name: pack.name, factor: pack.factor, price } };
  }

  medicine = await Medicine.findOne({ ...base, sku: new RegExp(`^${escapeRegex(code)}$`, 'i') });
  if (medicine) {
    return { medicine, unit: { name: medicine.baseUnit || 'unit', factor: 1, price: medicine.price } };
  }
  return null;
};

// Applies a bulk price rule to a number.
const applyPriceRule = (old, { mode, value, roundTo }) => {
  let next = mode === 'percent' ? Number(old) * (1 + Number(value) / 100) : Number(value);
  if (roundTo && Number(roundTo) > 0) {
    const step = Number(roundTo);
    next = Math.round(next / step) * step;
  }
  next = round2(next);
  return next < 0 ? 0 : next;
};

module.exports = {
  round2,
  cleanCode,
  normalizePackUnits,
  collectCodes,
  assertCodesAvailable,
  marginWarning,
  marginPercent,
  withMargin,
  diffPrices,
  recordPriceHistory,
  ean13CheckDigit,
  generateInternalBarcode,
  lookupByCode,
  applyPriceRule,
};
