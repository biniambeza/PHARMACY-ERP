import api from './axios';

export const getSupplierInvoices = async (params = {}) => (await api.get('/payables/invoices', { params })).data;
export const getSupplierInvoice = async (id) => (await api.get(`/payables/invoices/${id}`)).data;
export const createSupplierInvoice = async (data) => (await api.post('/payables/invoices', data)).data;
export const updateSupplierInvoice = async (id, data) => (await api.put(`/payables/invoices/${id}`, data)).data;
export const deleteSupplierInvoice = async (id) => (await api.delete(`/payables/invoices/${id}`)).data;
export const getSupplierPayments = async (params = {}) => (await api.get('/payables/payments', { params })).data;
export const recordSupplierPayment = async (data) => (await api.post('/payables/payments', data)).data;
export const getPayableBalances = async () => (await api.get('/payables/balances')).data;
export const getSupplierAccount = async (supplierId) => (await api.get(`/payables/suppliers/${supplierId}`)).data;
export const getPayablesAging = async () => (await api.get('/payables/aging')).data;
