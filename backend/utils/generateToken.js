const jwt = require('jsonwebtoken');

// Signs a JWT for a user. `tokenVersion` (claim `tv`) must match the user's
// current tokenVersion for the token to be accepted by `protect`; bumping the
// user's tokenVersion (e.g. on password change) revokes all older tokens.
const generateToken = (id, role, tokenVersion = 0) => {
  return jwt.sign({ id, role, tv: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });
};

module.exports = generateToken;
