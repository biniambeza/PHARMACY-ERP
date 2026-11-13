import api from './axios';

// ----- Patients (#16) -----
export const getPatients = async (params = {}) => (await api.get('/patients', { params })).data;
export const getPatient = async (id) => (await api.get(`/patients/${id}`)).data;
export const createPatient = async (data) => (await api.post('/patients', data)).data;
export const updatePatient = async (id, data) => (await api.put(`/patients/${id}`, data)).data;
export const archivePatient = async (id) => (await api.delete(`/patients/${id}`)).data;
export const getPatientHistory = async (id) => (await api.get(`/patients/${id}/history`)).data;

// ----- Prescriptions (#16) -----
export const getPrescriptions = async (params = {}) => (await api.get('/prescriptions', { params })).data;
export const getPrescription = async (id) => (await api.get(`/prescriptions/${id}`)).data;
export const createPrescription = async (data) => (await api.post('/prescriptions', data)).data;
export const updatePrescription = async (id, data) => (await api.put(`/prescriptions/${id}`, data)).data;
export const getRefillsDue = async (days = 7) => (await api.get('/prescriptions/refills-due', { params: { days } })).data;

// ----- Controlled register (#17) -----
export const getControlledRegister = async (params = {}) => (await api.get('/controlled/register', { params })).data;
export const getControlledMedicines = async () => (await api.get('/controlled/medicines')).data;

// ----- Interactions (#18) -----
export const getInteractionRules = async () => (await api.get('/interactions/rules')).data;
export const createInteractionRule = async (data) => (await api.post('/interactions/rules', data)).data;
export const updateInteractionRule = async (id, data) => (await api.put(`/interactions/rules/${id}`, data)).data;
export const deleteInteractionRule = async (id) => (await api.delete(`/interactions/rules/${id}`)).data;
// { patientId?, medicineIds } -> { interactions, allergyHits }
export const checkInteractions = async ({ patientId, medicineIds }) =>
  (await api.post('/interactions/check', { patientId: patientId || undefined, medicineIds })).data;

// Max decoded size accepted by the backend for prescription scans
export const MAX_RX_IMAGE_BYTES = 700 * 1024;
export const RX_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
