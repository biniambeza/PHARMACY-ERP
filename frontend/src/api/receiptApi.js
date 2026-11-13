import api from './axios';

// Digital receipts
// { sent, logged, channel, to } — logged = SMS/SMTP not configured on the server, only logged
export const sendReceipt = async (saleId, data) => (await api.post(`/receipts/${saleId}/send`, data)).data; // { channel: 'sms'|'email', to }
export const getReceiptText = async (saleId) => (await api.get(`/receipts/${saleId}/text`)).data; // { text }
