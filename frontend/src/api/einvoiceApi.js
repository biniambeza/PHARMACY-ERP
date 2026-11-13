import api, { LONG_REQUEST_TIMEOUT_MS } from './axios';

// Fiscal e-invoicing (tax authority submission)
export const getEInvoiceSettings = async () => (await api.get('/einvoice/settings')).data; // { settings }
export const updateEInvoiceSettings = async (data) => (await api.put('/einvoice/settings', data)).data;
// params: { status, from, to, search, page, limit } -> { sales, total, counts }
export const getFiscalInvoices = async (params = {}) => (await api.get('/einvoice', { params })).data;
export const getFiscalInvoice = async (saleId) => (await api.get(`/einvoice/${saleId}`)).data; // { sale, invoice, creditNotes, returns }
export const submitFiscalInvoice = async (saleId) => (await api.post(`/einvoice/submit/${saleId}`)).data;
export const issueCreditNote = async (returnId) => (await api.post(`/einvoice/credit-note/${returnId}`)).data;
export const retryFailedInvoices = async (data = {}) => (await api.post('/einvoice/retry-failed', data, { timeout: LONG_REQUEST_TIMEOUT_MS })).data; // { summary }
export const submitPendingInvoices = async (data) => (await api.post('/einvoice/submit-pending', data, { timeout: LONG_REQUEST_TIMEOUT_MS })).data; // { from, to }
