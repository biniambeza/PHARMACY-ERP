// Fiscal e-invoicing provider adapters (same pattern as services/payments).
//
// Provider interface:
//   name, label, testOnly
//   isConfigured() -> boolean
//   submit(payload, { mode }) ->
//       { status: 'accepted'|'submitted'|'rejected'|'not_required',
//         fiscalNumber?, irn?, qrPayload?, reason?, response? }
//     'submitted' = the authority took the document but acceptance is asynchronous.
//     Throwing (AppError) means a technical failure: the record becomes 'failed'
//     and can be retried.
//
// Adapters:
//   none - no fiscal submission (e.g. not VAT registered): marks 'not_required'.
//   mock - TEST ONLY. Validates and "accepts" locally with a deterministic fake
//          fiscal number prefixed MOCK-. Nothing is sent to any tax authority and
//          the numbers have no legal value.
//   mor  - Ethiopian Ministry of Revenues e-invoicing. STUB: we do not have the
//          official API specification or credentials, so it refuses to submit.
const crypto = require('crypto');
const AppError = require('../../utils/AppError');

const MOCK_PREFIX = 'MOCK-';

const noneProvider = {
  name: 'none',
  label: 'None (no fiscal submission)',
  testOnly: false,
  isConfigured: () => true,
  submit: async () => ({ status: 'not_required' }),
};

const mockProvider = {
  name: 'mock',
  label: 'Mock (test only, not a tax authority)',
  testOnly: true,
  isConfigured: () => true,
  submit: async (payload) => {
    // Simulates authority-side checks so the rejected path can be exercised.
    const tenDigits = /^\d{10}$/;
    if (!tenDigits.test(payload.seller.tin)) {
      return { status: 'rejected', reason: 'MOCK: seller TIN must be 10 digits', response: { code: 'MOCK_TIN' } };
    }
    if (payload.buyer?.tin && !tenDigits.test(payload.buyer.tin)) {
      return { status: 'rejected', reason: 'MOCK: buyer TIN must be 10 digits', response: { code: 'MOCK_BUYER_TIN' } };
    }
    const key = [
      payload.seller.tin,
      payload.documentType,
      payload.invoiceNumber,
      payload.issueDate,
      payload.totals?.grandTotal,
    ].join('|');
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const fiscalNumber = `${MOCK_PREFIX}${hash.slice(0, 12).toUpperCase()}`;
    const irn = `${MOCK_PREFIX}${hash}`;
    const qrPayload = [
      'TEST-ONLY',
      `TIN:${payload.seller.tin}`,
      `INV:${payload.invoiceNumber}`,
      `DATE:${payload.issueDate}`,
      `TOTAL:${payload.totals?.grandTotal}`,
      `TAX:${payload.totals?.taxTotal}`,
      `FN:${fiscalNumber}`,
    ].join('|');
    return { status: 'accepted', fiscalNumber, irn, qrPayload, response: { mock: true } };
  },
};

const morEnv = () => ({
  baseUrl: (process.env.EINVOICE_MOR_BASE_URL || '').trim(),
  apiKey: (process.env.EINVOICE_MOR_API_KEY || '').trim(),
});

const morProvider = {
  name: 'mor',
  label: 'Ministry of Revenues (MoR) e-invoicing',
  testOnly: false,
  isConfigured: () => {
    const { baseUrl, apiKey } = morEnv();
    return Boolean(baseUrl && apiKey);
  },
  // eslint-disable-next-line no-unused-vars
  submit: async (payload, { mode } = {}) => {
    if (!morProvider.isConfigured()) {
      throw new AppError(
        'MoR e-invoicing is not configured: provide the official API specification and credentials ' +
          '(EINVOICE_MOR_BASE_URL / EINVOICE_MOR_API_KEY)',
        503
      );
    }
    // TODO(MoR adapter): implement once the official specification and sandbox
    // credentials are available. Nothing below is based on a published spec.
    //  1. Authentication: obtain/refresh a token with EINVOICE_MOR_API_KEY (and any
    //     client id/secret or certificate the spec requires; add env vars for them
    //     and document them in backend/.env.example - never store them in the DB).
    //  2. Map our payload (services/einvoice/payload.js, schema 'pharmacy-erp/einvoice@1'):
    //       seller.tin / seller.vatRegNo / name / address -> seller block
    //       buyer.tin / buyer.legalName (B2B) or walk-in buyer -> buyer block
    //       invoiceNumber, issueDate, currency, documentType ('invoice'|'credit_note')
    //       originalInvoice.{invoiceNumber, irn, fiscalNumber} -> credit-note reference
    //       lines[]: description, quantity, unit, unitPrice, discount, taxableAmount,
    //                taxCategory/taxRate (map to the official tax codes), taxAmount, lineTotal
    //       taxLines[] / totals -> document totals
    //     Add any mandatory fields the spec needs (item codes, device/branch ids,
    //     payment means codes...) to the payload builder and its validation.
    //  3. POST to `${baseUrl}/...` (sandbox vs production base URL by `mode`), with a
    //     timeout and an idempotency key (our invoiceNumber + pharmacy TIN).
    //  4. Map the response: authority invoice number -> fiscalNumber, IRN/UUID -> irn,
    //     signed QR content -> qrPayload; validation errors -> { status: 'rejected', reason };
    //     async acceptance -> { status: 'submitted' } plus a checkStatus() poller.
    //  5. Throw AppError (status 502/503) on network/5xx errors so the record is
    //     'failed' and picked up by POST /api/einvoice/retry-failed.
    throw new AppError(
      'The MoR e-invoicing adapter is not implemented yet: the official API specification is required',
      501
    );
  },
};

const PROVIDERS = { none: noneProvider, mock: mockProvider, mor: morProvider };

const getProvider = (name) => {
  const key = String(name || 'none').trim().toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) throw new AppError(`Unknown e-invoicing provider "${name}"`, 400);
  return provider;
};

const listProviders = () =>
  Object.values(PROVIDERS).map((p) => ({
    name: p.name,
    label: p.label,
    testOnly: p.testOnly,
    configured: p.isConfigured(),
  }));

module.exports = { PROVIDERS, getProvider, listProviders, MOCK_PREFIX };
