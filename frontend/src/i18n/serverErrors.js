// Translation of server (API) error messages.
//
// The backend sends its error messages in English on purpose (one source of truth, logs and
// support stay readable). The axios response interceptor (src/api/axios.js) passes each error
// message through translateServerMessage when the UI language is not English, so the many
// `err.response?.data?.message || t('fallback')` call sites show translated text without
// changes.
//
// Messages live in the `errors` namespace (locales/<lng>/errors.json):
//   messages.<key>  exact server texts (the English file is the lookup table: text -> key)
//   patterns.<key>  texts with dynamic parts; SERVER_MESSAGE_PATTERNS below captures the parts
//                   from the English message and passes them as interpolation values.
// Unknown messages are returned unchanged. To add one: add the English text to
// en/errors.json (plus am/om), and for dynamic text a pattern entry here.
// Pure module (no i18next import) so it can run under `node --test`.

// The capture groups are passed to the translation in the order of `params`.
export const SERVER_MESSAGE_PATTERNS = [
  { key: 'insufficientStock', re: /^Insufficient stock for "(.+)"\. Requested: (\S+), Available: (\S+)$/, params: ['name', 'requested', 'available'] },
  { key: 'creditLimitExceeded', re: /^Credit limit exceeded for (.+): available credit is (\S+), requested (\S+)$/, params: ['name', 'available', 'requested'] },
  { key: 'creditNotAllowed', re: /^Credit is not allowed for (.+)$/, params: ['name'] },
  { key: 'shiftAlreadyOpenNumber', re: /^You already have an open shift \((.+)\)$/, params: ['shift'] },
  { key: 'returnTooMany', re: /^Cannot return (\S+) of "(.+)" \(batch (.*)\): only (\S+) left to return$/, params: ['qty', 'name', 'batch', 'remaining'] },
  { key: 'stockChangedFor', re: /^Stock for (.+) changed, please try again$/, params: ['name'] },
  { key: 'batchNotFoundFor', re: /^Batch not found for (.+)$/, params: ['name'] },
  { key: 'medicineArchived', re: /^Medicine is archived: (.+)$/, params: ['names'] },
  { key: 'controlledNeedsRx', re: /^A patient and a prescription are required to dispense controlled medicine\(s\): (.+)$/, params: ['names'] },
  { key: 'controlledOffline', re: /^Controlled medicines cannot be sold offline: (.+)$/, params: ['names'] },
  { key: 'schemeInactive', re: /^Insurance scheme "(.+)" is not active$/, params: ['name'] },
  { key: 'notCovered', re: /^No item in this sale is covered by "(.+)"$/, params: ['name'] },
  { key: 'discountMaxPct', re: /^Discount cannot exceed (\S+)% of the subtotal$/, params: ['pct'] },
  { key: 'passwordMin', re: /^Password must be at least (\d+) characters long$/, params: ['min'] },
  { key: 'newPasswordMin', re: /^New password must be at least (\d+) characters long$/, params: ['min'] },
  { key: 'paymentExceedsBalance', re: /^Payment exceeds the outstanding balance of (\S+)$/, params: ['amount'] },
  { key: 'missingBatchExpiry', re: /^Missing batch number or expiry date for "(.+)"$/, params: ['name'] },
  { key: 'expiryFutureFor', re: /^Expiry date for "(.+)" must be in the future$/, params: ['name'] },
  { key: 'barcodeUsed', re: /^Barcode (\S+) is already used by "(.+)"$/, params: ['code', 'name'] },
  { key: 'rxNotActive', re: /^Prescription (\S+) is not active$/, params: ['number'] },
  { key: 'rxNoRefills', re: /^Prescription (\S+): no refills left for (.+)$/, params: ['number', 'name'] },
  { key: 'mobileRefUsed', re: /^Mobile money reference (\S+) was already used for sale (\S+)$/, params: ['ref', 'invoice'] },
  { key: 'saleMaxLines', re: /^A sale can have at most (\d+) lines$/, params: ['max'] },
  { key: 'noSuchUnit', re: /^"(.+)" has no unit "(.+)"$/, params: ['name', 'unit'] },
  { key: 'reportMaxYears', re: /^Reports can cover at most (\d+) years\. Choose a shorter date range\.$/, params: ['years'] },
  { key: 'roleNotAuthorized', re: /^User role '(.*)' is not authorized to access this route$/, params: ['role'] },
];

// English text -> key index, built once per English `messages` object.
const indexCache = new WeakMap();
const exactIndex = (enMessages) => {
  if (!enMessages || typeof enMessages !== 'object') return new Map();
  let index = indexCache.get(enMessages);
  if (!index) {
    index = new Map(Object.entries(enMessages).map(([key, text]) => [String(text), key]));
    indexCache.set(enMessages, index);
  }
  return index;
};

/**
 * Translate one server message.
 * @param {string} message   the server's (English) message
 * @param {(key: string, options?: object) => string} t  i18next t (any language)
 * @param {object} enMessages  the English `errors.messages` object (lookup table)
 * @returns {string} translated text, or `message` unchanged when it is not known
 */
export const translateServerMessage = (message, t, enMessages) => {
  if (typeof message !== 'string' || !message.trim() || typeof t !== 'function') return message;
  const text = message.trim();
  const key = exactIndex(enMessages).get(text);
  if (key) return t(`errors:messages.${key}`, { defaultValue: message });
  for (const pattern of SERVER_MESSAGE_PATTERNS) {
    const match = pattern.re.exec(text);
    if (!match) continue;
    const values = Object.fromEntries(pattern.params.map((name, i) => [name, match[i + 1]]));
    return t(`errors:patterns.${pattern.key}`, { ...values, defaultValue: message });
  }
  return message;
};
