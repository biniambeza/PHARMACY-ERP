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

module.exports = {
  parsePagination,
  isValidId,
  sameDay,
  RECEIVABLE_STATUSES,
  round2,
};
