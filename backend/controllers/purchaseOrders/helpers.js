const mongoose = require('mongoose');

const MAX_PAGE_LIMIT = 200;
const DEFAULT_PAGE_LIMIT = 50;

// Pagination is opt-in via `?page=`. Without it every match is returned.
const parsePagination = (query) => {
  if (query.page === undefined) return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_PAGE_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_PAGE_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
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
