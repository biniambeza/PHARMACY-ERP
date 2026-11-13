// Two-factor login (TOTP authenticator apps) helpers.
//
// - TOTP secrets are stored AES-256-GCM encrypted. The key comes from
//   TWO_FACTOR_ENCRYPTION_KEY, falling back to a key derived from JWT_SECRET.
//   Changing that key makes stored secrets unreadable (users must re-enrol,
//   an admin can reset their 2FA).
// - Recovery codes are stored as keyed hashes (HMAC-SHA256), never in clear.
// - Login challenge tokens are JWTs signed with a key derived from JWT_SECRET
//   (not JWT_SECRET itself) and carry no `tv` claim, so `protect` can never
//   accept them as session tokens.
//
// otplib v13: the `otplib` umbrella package loads ESM-only plugins
// (@scure/base, @noble/hashes) that Jest's CommonJS runtime cannot require,
// so we use its CommonJS building blocks (@otplib/core, /totp, /uri) with
// small Node `crypto` and base32 plugins below.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { generateSecret: otpGenerateSecret } = require('@otplib/core');
const totp = require('@otplib/totp');
const { generateTOTP: otpGenerateUri } = require('@otplib/uri');

// --------------------------------------------------------- otplib plugins

const NODE_HASHES = { sha1: 'sha1', sha256: 'sha256', sha512: 'sha512' };

const nodeCrypto = {
  name: 'node-crypto',
  algorithms: Object.keys(NODE_HASHES),
  hmac(algorithm, key, data) {
    const hash = NODE_HASHES[algorithm];
    if (!hash) throw new Error(`Unsupported algorithm ${algorithm}`);
    return new Uint8Array(crypto.createHmac(hash, Buffer.from(key)).update(Buffer.from(data)).digest());
  },
  randomBytes(length) {
    return new Uint8Array(crypto.randomBytes(length));
  },
  constantTimeEqual(a, b) {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  },
};

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32 = {
  name: 'node-base32',
  encode(data, { padding = false } = {}) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of data) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
    if (padding) while (out.length % 8) out += '=';
    return out;
  },
  decode(str) {
    const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of clean) {
      const idx = B32_ALPHABET.indexOf(ch);
      if (idx === -1) throw new Error('Invalid base32 character');
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  },
};

const generateSecret = () => otpGenerateSecret({ crypto: nodeCrypto, base32, length: 20 });
const generateURI = ({ issuer, label, secret }) => otpGenerateUri({ issuer, label, secret });
const verify = (options) => totp.verify({ ...options, crypto: nodeCrypto, base32 });
// Current code for a secret (used by tests / tooling).
const generateTotp = (secret, epoch) =>
  totp.generate({ secret, crypto: nodeCrypto, base32, ...(epoch !== undefined ? { epoch } : {}) });

const ISSUER = process.env.TWO_FACTOR_ISSUER || 'Pharmacy ERP';
const PERIOD_SECONDS = 30;
// Accept the previous / next 30 s window to tolerate small clock drift.
const EPOCH_TOLERANCE_SECONDS = 30;
const RECOVERY_CODE_COUNT = 8;
const CHALLENGE_TTL = '5m';
const CHALLENGE_PURPOSE = '2fa_login';
// A setup (pending secret) must be confirmed within this time.
const SETUP_TTL_MS = 15 * 60 * 1000;

const deriveKey = (label) => {
  const base = process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET is not configured');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(base)), Buffer.alloc(0), Buffer.from(label), 32));
};

const challengeKey = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return crypto.createHmac('sha256', String(process.env.JWT_SECRET)).update('pharmacy-erp:2fa-challenge').digest('hex');
};

// ------------------------------------------------------------- secret storage

const encryptSecret = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('pharmacy-erp:2fa-secret'), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
};

// Returns null when the value cannot be decrypted (e.g. key changed).
const decryptSecret = (stored) => {
  try {
    const [version, iv, tag, data] = String(stored || '').split(':');
    if (version !== 'v1' || !iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('pharmacy-erp:2fa-secret'), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};

// ------------------------------------------------------------------- TOTP

const newSecret = () => generateSecret();

const otpauthUrl = (secret, label) => generateURI({ issuer: ISSUER, label: String(label), secret });

// Normalises user input: keeps digits only ("123 456" -> "123456").
const normaliseCode = (code) => String(code == null ? '' : code).replace(/[\s-]/g, '');

// Verifies a 6-digit code. Returns the matched time step (number) or null.
// `afterStep` rejects codes from that step or earlier (replay protection).
const verifyTotp = async (secret, code, afterStep = null) => {
  const token = normaliseCode(code);
  if (!secret || !/^\d{6}$/.test(token)) return null;
  try {
    const options = { secret, token, epochTolerance: EPOCH_TOLERANCE_SECONDS };
    if (typeof afterStep === 'number') options.afterTimeStep = afterStep;
    const result = await verify(options);
    return result && result.valid ? result.timeStep : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------- recovery codes

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const normaliseRecoveryCode = (code) => String(code == null ? '' : code).toLowerCase().replace(/[^a-z0-9]/g, '');

const hashRecoveryCode = (code) =>
  crypto.createHmac('sha256', deriveKey('pharmacy-erp:2fa-recovery')).update(normaliseRecoveryCode(code)).digest('hex');

// Returns { codes: ['xxxxx-xxxxx', ...], records: [{ hash, usedAt: null }] }
const generateRecoveryCodes = (count = RECOVERY_CODE_COUNT) => {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = crypto.randomBytes(10);
    let raw = '';
    for (let j = 0; j < 10; j += 1) raw += RECOVERY_ALPHABET[bytes[j] % RECOVERY_ALPHABET.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { codes, records: codes.map((c) => ({ hash: hashRecoveryCode(c), usedAt: null })) };
};

// ---------------------------------------------------------- challenge token

const signChallenge = (user) =>
  jwt.sign(
    { sub: String(user._id), purpose: CHALLENGE_PURPOSE, v: user.tokenVersion || 0 },
    challengeKey(),
    { expiresIn: CHALLENGE_TTL }
  );

// Returns the decoded payload or null.
const verifyChallenge = (token) => {
  if (!token || typeof token !== 'string' || token.length > 2000) return null;
  try {
    const decoded = jwt.verify(token, challengeKey());
    return decoded && decoded.purpose === CHALLENGE_PURPOSE && decoded.sub ? decoded : null;
  } catch {
    return null;
  }
};

module.exports = {
  ISSUER,
  PERIOD_SECONDS,
  RECOVERY_CODE_COUNT,
  SETUP_TTL_MS,
  encryptSecret,
  decryptSecret,
  newSecret,
  otpauthUrl,
  verifyTotp,
  generateTotp,
  normaliseCode,
  normaliseRecoveryCode,
  hashRecoveryCode,
  generateRecoveryCodes,
  signChallenge,
  verifyChallenge,
};
