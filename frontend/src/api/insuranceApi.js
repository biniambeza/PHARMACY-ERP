// Insurance / credit-scheme billing API (/api/insurance). Owner: Insurance agent.
import api from './axios';
import { downloadBlob } from '../utils/export';

// Schemes
export const getSchemes = async (params = {}) => (await api.get('/insurance/schemes', { params })).data;
export const getScheme = async (id) => (await api.get(`/insurance/schemes/${id}`)).data;
export const createScheme = async (data) => (await api.post('/insurance/schemes', data)).data;
export const updateScheme = async (id, data) => (await api.put(`/insurance/schemes/${id}`, data)).data;
export const deleteScheme = async (id) => (await api.delete(`/insurance/schemes/${id}`)).data;

// Members
export const getMembers = async (params = {}) => (await api.get('/insurance/members', { params })).data;
export const lookupMembers = async (schemeId, q) =>
  (await api.get('/insurance/members/lookup', { params: { schemeId, q } })).data;
export const createMember = async (data) => (await api.post('/insurance/members', data)).data;
export const updateMember = async (id, data) => (await api.put(`/insurance/members/${id}`, data)).data;
export const deleteMember = async (id) => (await api.delete(`/insurance/members/${id}`)).data;

// POS preview: { schemeId, memberId, lines: [{ medicineId, amount }] }
export const previewInsurance = async (data) => (await api.post('/insurance/preview', data)).data;

// Claims
export const getClaims = async (params = {}) => (await api.get('/insurance/claims', { params })).data;
export const getUnclaimed = async (params) => (await api.get('/insurance/claims/unclaimed', { params })).data;
export const createClaim = async (data) => (await api.post('/insurance/claims', data)).data;
export const getClaim = async (id) => (await api.get(`/insurance/claims/${id}`)).data;
export const refreshClaim = async (id) => (await api.post(`/insurance/claims/${id}/refresh`)).data;
export const submitClaim = async (id) => (await api.post(`/insurance/claims/${id}/submit`)).data;
export const recordClaimPayment = async (id, data) => (await api.post(`/insurance/claims/${id}/payments`, data)).data;
export const rejectClaim = async (id, data) => (await api.post(`/insurance/claims/${id}/reject`, data)).data;
export const deleteClaim = async (id) => (await api.delete(`/insurance/claims/${id}`)).data;
export const downloadClaimExcel = async (claim) => {
  const res = await api.get(`/insurance/claims/${claim._id}/export`, { responseType: 'blob' });
  downloadBlob(res.data, `${claim.claimNumber}.xlsx`);
};

// Receivables
export const getInsuranceReceivables = async () => (await api.get('/insurance/receivables')).data;
