// Operational error with an HTTP status. Throw it from controllers (or inside
// transactions); the central error handler in server.js turns it into a response.
class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.isOperational = true;
  }
}

module.exports = AppError;
