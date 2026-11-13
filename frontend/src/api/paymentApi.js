import api from './axios';

// Mobile money (#26)
export const getPaymentProviders = async () => (await api.get('/payments/providers')).data;
// { amount, provider?, phone?, reference? } -> { intent: { _id, status, reference, providerRef, ... } }
export const createPaymentIntent = async (data) => (await api.post('/payments/intents', data)).data;
export const getPaymentIntent = async (id) => (await api.get(`/payments/intents/${id}`)).data;
export const cancelPaymentIntent = async (id) => (await api.post(`/payments/intents/${id}/cancel`)).data;
