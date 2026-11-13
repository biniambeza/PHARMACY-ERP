// Shared email format check. Accepts modern top-level domains (.health, .info,
// .pharmacy...), plus-addressing (name+tag@...) and subdomains; rejects spaces,
// missing "@", missing domain dot and leading/trailing/double dots.
const EMAIL_RE = /^(?!.*\.\.)[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/;

const isValidEmail = (value) => {
  const s = String(value || '').trim();
  return s.length <= 254 && !s.startsWith('.') && !/\.@/.test(s) && EMAIL_RE.test(s);
};

module.exports = { EMAIL_RE, isValidEmail };
