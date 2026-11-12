// Escape user input before using it inside a MongoDB $regex / RegExp.
const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = escapeRegex;
