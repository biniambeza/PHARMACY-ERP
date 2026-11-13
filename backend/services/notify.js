// Notification service (#4, #5, #8). Owner: Notify agent.
//
// Contract (docs/AGENT_PLAN.md):
//   createNotification({ pharmacyId, type, title, message, link, severity, userIds?,
//                        dedupeKey?, dedupeWindowMs?, perm?, meta? })
//   sendEmail({ to, subject, text, html })
//   sendSms({ to, text })
//
// None of these functions throw: failures are logged and swallowed so a
// notification problem never breaks the business operation that caused it.
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const DedupeMarker = require('../models/DedupeMarker');

const DAY_MS = 24 * 60 * 60 * 1000;
const isTest = () => process.env.NODE_ENV === 'test';

const log = (...args) => {
  if (!isTest()) console.log('[notify]', ...args);
};
const logError = (...args) => {
  if (!isTest()) console.error('[notify]', ...args);
};

const toObjectId = (v) => {
  if (!v) return null;
  if (v instanceof mongoose.Types.ObjectId) return v;
  if (v._id instanceof mongoose.Types.ObjectId) return v._id;
  return mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null;
};

/**
 * Atomically claims marker `_id` for `windowMs`. Free when missing or expired.
 * A concurrent claim loses with a duplicate-key error (unique _id): returns false.
 */
const claimMarker = async (_id, windowMs) => {
  const now = new Date();
  try {
    await DedupeMarker.findOneAndUpdate(
      { _id, expiresAt: { $lte: now } },
      { $set: { expiresAt: new Date(now.getTime() + windowMs), createdAt: now } },
      { upsert: true }
    );
    return true;
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
};

/**
 * Creates an in-app notification.
 * - userIds empty/omitted: visible to every staff member of the pharmacy
 *   (optionally restricted to roles holding `perm`).
 * - dedupeKey: if a notification with the same pharmacyId + type + dedupeKey
 *   was created within dedupeWindowMs (default 24h), nothing is created and
 *   the existing notification is returned. Race-free: a DedupeMarker with a
 *   unique _id is claimed before inserting (concurrent runs / instances).
 * Returns the notification document (new or existing) or null on failure.
 * The returned doc has a non-persisted `wasCreated` flag.
 */
const createNotification = async ({
  pharmacyId,
  type,
  title,
  message = '',
  link = '',
  severity = 'info',
  userIds = [],
  dedupeKey = null,
  dedupeWindowMs = DAY_MS,
  perm = null,
  meta = null,
} = {}) => {
  let markerId = null;
  try {
    const pid = toObjectId(pharmacyId);
    if (!pid || !type || !title) {
      logError('createNotification: pharmacyId, type and title are required');
      return null;
    }

    if (dedupeKey) {
      const windowMs = Math.max(0, Number(dedupeWindowMs) || DAY_MS);
      const findExisting = () =>
        Notification.findOne({
          pharmacyId: pid,
          type,
          dedupeKey: String(dedupeKey),
          createdAt: { $gte: new Date(Date.now() - windowMs) },
        });
      const existing = await findExisting();
      if (existing) {
        existing.wasCreated = false;
        return existing;
      }
      // Atomic claim (unique _id): two concurrent callers (or instances) cannot both
      // pass the check above and insert. The marker is a lease until the window ends.
      const key = `notify:${pid}:${type}:${String(dedupeKey)}`;
      if (!(await claimMarker(key, windowMs))) {
        // Another caller is creating (or created) it: return theirs when visible.
        for (let i = 0; i < 5; i += 1) {
          const other = await findExisting();
          if (other) {
            other.wasCreated = false;
            return other;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        return null;
      }
      markerId = key;
    }

    const doc = await Notification.create({
      pharmacyId: pid,
      type,
      title: String(title).slice(0, 200),
      message: String(message || '').slice(0, 2000),
      link: link || '',
      severity: Notification.SEVERITIES.includes(severity) ? severity : 'info',
      userIds: (Array.isArray(userIds) ? userIds : [userIds]).map(toObjectId).filter(Boolean),
      perm: perm || null,
      dedupeKey: dedupeKey ? String(dedupeKey) : null,
      meta,
    });
    doc.wasCreated = true;
    return doc;
  } catch (err) {
    logError('createNotification failed:', err && err.message);
    // Nothing was created: free the dedupe slot so the next run can retry.
    if (markerId) await DedupeMarker.deleteOne({ _id: markerId }).catch(() => {});
    return null;
  }
};

// ---------------------------------------------------------------- email

let transporter = null;
let transporterKey = '';

const smtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);

const getTransporter = () => {
  const key = [process.env.SMTP_HOST, process.env.SMTP_PORT, process.env.SMTP_USER].join('|');
  if (transporter && transporterKey === key) return transporter;
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // Never let a slow / unreachable SMTP server hang a request or a job.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  transporterKey = key;
  return transporter;
};

/**
 * Sends an email through SMTP when SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM are
 * set; otherwise only logs it. Returns { sent: boolean, skipped?: boolean }.
 */
const sendEmail = async ({ to, subject, text, html } = {}) => {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return { sent: false, skipped: true };

  if (!smtpConfigured()) {
    log(`email (SMTP not configured) to=${recipients.join(',')} subject="${subject}"`);
    return { sent: false, skipped: true };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: recipients.join(', '),
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    logError('sendEmail failed:', err && err.message);
    return { sent: false };
  }
};

// ---------------------------------------------------------------- sms

/**
 * Sends an SMS via a generic HTTP provider when SMS_PROVIDER_URL and
 * SMS_API_KEY are set: POST <url> { to, text, from? } with
 * "Authorization: Bearer <key>". Otherwise only logs.
 */
const sendSms = async ({ to, text } = {}) => {
  if (!to || !text) return { sent: false, skipped: true };
  const url = process.env.SMS_PROVIDER_URL;
  const key = process.env.SMS_API_KEY;
  if (!url || !key) {
    log(`sms (provider not configured) to=${to} text="${String(text).slice(0, 60)}"`);
    return { sent: false, skipped: true };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ to, text, from: process.env.SMS_FROM || undefined }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logError(`sendSms failed: HTTP ${res.status}`);
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    logError('sendSms failed:', err && err.message);
    return { sent: false };
  }
};

module.exports = {
  createNotification,
  sendEmail,
  sendSms,
  smtpConfigured,
  DAY_MS,
};
