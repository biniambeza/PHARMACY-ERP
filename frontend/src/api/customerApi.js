import api from './axios';

export const getCustomers = async (params = {}) => (await api.get('/customers', { params })).data;
export const getCustomerById = async (id) => (await api.get(`/customers/${id}`)).data;
export const createCustomer = async (data) => (await api.post('/customers', data)).data;
export const updateCustomer = async (id, data) => (await api.put(`/customers/${id}`, data)).data;
export const deleteCustomer = async (id, { force = false } = {}) =>
  (await api.delete(`/customers/${id}`, { params: force ? { force: true } : undefined })).data;
export const recordCustomerPayment = async (id, data) => (await api.post(`/customers/${id}/payments`, data)).data;
export const getCustomerPayments = async (id) => (await api.get(`/customers/${id}/payments`)).data;
export const getCustomerStatement = async (id, params = {}) =>
  (await api.get(`/customers/${id}/statement`, { params })).data;
export const getReceivablesAging = async (params = {}) => (await api.get('/customers/aging', { params })).data;
