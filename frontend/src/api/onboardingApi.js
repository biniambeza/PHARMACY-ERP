import api from './axios';

// First-run onboarding checklist
export const getOnboardingStatus = async () => (await api.get('/onboarding/status')).data; // { onboarding }
export const dismissOnboarding = async () => (await api.post('/onboarding/dismiss')).data;
export const restoreOnboarding = async () => (await api.delete('/onboarding/dismiss')).data;
