// Central error handling. Express 5 forwards rejected promises from async
// handlers here automatically, so controllers can simply `throw`.

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
};

// Maps an error to { status, message, code? } that is safe to send to the client.
// `code` is a machine-readable string (e.g. 'SHIFT_CLOSED') set on operational errors.
const toHttpError = (err) => {
  // Operational errors thrown on purpose (utils/AppError)
  if (err.isOperational) {
    const out = { status: err.status || 400, message: err.message };
    if (typeof err.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(err.code)) out.code = err.code;
    return out;
  }

  // CORS rejection (see app.js)
  if (err.code === 'CORS_REJECTED') {
    return { status: 403, message: 'Origin not allowed' };
  }

  // Malformed JSON / oversized body from express.json()
  if (err.type === 'entity.parse.failed') {
    return { status: 400, message: 'Malformed JSON body' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, message: 'Request body too large' };
  }

  // Mongoose schema validation
  if (err.name === 'ValidationError' && err.errors) {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
    return { status: 400, message: message || 'Validation failed' };
  }

  // Invalid ObjectId or other cast failure
  if (err.name === 'CastError') {
    return { status: 400, message: 'Invalid id' };
  }

  // Duplicate key (unique index)
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || err.keyPattern || {}).filter((f) => f !== 'pharmacyId');
    return {
      status: 409,
      message: fields.length ? `A record with this ${fields.join(', ')} already exists` : 'Duplicate record',
    };
  }

  // Other client errors raised by Express/body-parser that are safe to expose
  const status = err.status || err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500 && err.expose !== false) {
    return { status, message: err.message };
  }

  return { status: 500, message: 'Internal server error' };
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const { status, message, code } = toHttpError(err);

  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  return res.status(status).json(code ? { success: false, message, code } : { success: false, message });
};

module.exports = { errorHandler, notFound, toHttpError };
