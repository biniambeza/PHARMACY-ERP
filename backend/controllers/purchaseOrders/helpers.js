const mongoose = require('mongoose');

const MAX_PAGE_LIMIT = 1000;
const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_UNPAGED_LIMIT = 200;

// Lists are always bounded: ?page= pages through (default 50 per page); without it the
// first DEFAULT_UNPAGED_LIMIT rows are returned. ?limit= raises either up to MAX_PAGE_LIMIT.
// `paged` tells whether the caller asked for a page.
const parsePagination = (query) => {
  const paged = query.page !== undefined;
  const page = paged ? Math.max(1, parseInt(query.page, 10) || 1) : 1;
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || (paged ? DEFAULT_PAGE_LIMIT : DEFAULT_UNPAGED_LIMIT))
  );
  return { paged, page, limit, skip: (page - 1) * limit };
};

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const isValidId = (id) =>
  (typeof id === 'string' || id instanceof mongoose.Types.ObjectId) &&
  OBJECT_ID_PATTERN.test(String(id));

// Compare two dates by calendar day (UTC), which is how expiry dates are entered.
const sameDay = (a, b) =>
  new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// Statuses in which deliveries can still be received.
const RECEIVABLE_STATUSES = ['ordered', 'partially_received'];

const round2 = (n) => Number(Number(n).toFixed(2));

// Unit cost of a batch after merging new units into it (weighted average). Units already on
// hand keep their cost, paid units come in at `newCost` and bonus units at zero cost:
//   (qOld * cOld + qPaid * cNew) / (qOld + qPaid + qBonus)
// Rounded to 4 decimals (the precision used for per-base-unit costs).
const weightedAverageCost = ({ onHandQty, onHandCost, paidQty, paidCost, bonusQty = 0 }) => {
  const qOld = Math.max(0, Number(onHandQty) || 0);
  const cOld = Math.max(0, Number(onHandCost) || 0);
  const qNew = Math.max(0, Number(paidQty) || 0);
  const cNew = Math.max(0, Number(paidCost) || 0);
  const qBonus = Math.max(0, Number(bonusQty) || 0);
  const totalQty = qOld + qNew + qBonus;
  if (totalQty <= 0) return cOld;
  return Math.round(((qOld * cOld + qNew * cNew) / totalQty) * 10000) / 10000;
};

module.exports = {
  parsePagination,
  isValidId,
  sameDay,
  RECEIVABLE_STATUSES,
  round2,
  weightedAverageCost,
};
