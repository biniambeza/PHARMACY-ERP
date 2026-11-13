import axios from 'axios';
import i18n from '../i18n';
import { translateServerMessage } from '../i18n/serverErrors';

// The localhost fallback is for local development only: vite.config.js fails a production
// build when VITE_API_URL is not set, so it can never reach a deployed bundle.
const rawUrl = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')).trim();
const cleanUrl = rawUrl.replace(/\/+$/, '');
const baseURL = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;

// Requests that get no answer within this time fail with ECONNABORTED (a network error for
// offline/queue.js isNetworkError), so e.g. the POS falls back to saving the sale offline on a
// half-open connection; the sale's offlineId makes the later retry idempotent.
export const REQUEST_TIMEOUT_MS = 25000;
// For known slow calls (file import / export, batch submissions): pass { timeout: LONG_REQUEST_TIMEOUT_MS }.
export const LONG_REQUEST_TIMEOUT_MS = 120000;

const api = axios.create({
  baseURL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const ACTIVE_PHARMACY_KEY = 'activePharmacyId';

// Automatically attach JWT token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Active branch for tenant users (see AuthContext.switchPharmacy)
    const activePharmacyId = localStorage.getItem(ACTIVE_PHARMACY_KEY);
    if (activePharmacyId && !config.headers['x-pharmacy-id']) {
      config.headers['x-pharmacy-id'] = activePharmacyId;
    }
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        config.headers['x-timezone'] = tz;
      }
      config.headers['x-timezone-offset'] = new Date().getTimezoneOffset();
    } catch {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global auth failure handling: an expired/revoked token (401) or a pharmacy
// that was suspended/archived (403 with a PHARMACY_* code) ends the session.
// The login request itself is excluded so a wrong password just shows an error.
const SESSION_ENDING_CODES = ['PHARMACY_SUSPENDED', 'PHARMACY_ARCHIVED', 'ACCOUNT_DEACTIVATED'];
// Codes caused by the selected branch only: fall back to the default branch.
const BRANCH_CODES = ['NO_BRANCH_ACCESS', 'PHARMACY_SUSPENDED', 'PHARMACY_ARCHIVED'];

// Server error messages are English; show them in the UI language (errors namespace, see
// i18n/serverErrors.js). The English text is kept in data.originalMessage. Unknown messages
// stay as they are.
const translateErrorMessage = (error) => {
  const data = error.response?.data;
  if (!data || typeof data !== 'object' || typeof data.message !== 'string') return;
  const lang = i18n.resolvedLanguage || i18n.language;
  if (!lang || lang === 'en') return;
  try {
    const translated = translateServerMessage(data.message, i18n.t.bind(i18n), i18n.getResourceBundle('en', 'errors')?.messages);
    if (translated && translated !== data.message) {
      data.originalMessage = data.message;
      data.message = translated;
    }
  } catch {
    // keep the server text
  }
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    translateErrorMessage(error);
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const url = error.config?.url || '';
    const isLoginRequest = url.includes('/auth/login');
    const sentBranch = error.config?.headers?.['x-pharmacy-id'];

    // The selected branch is no longer usable: forget it and reload with the default one.
    if (status === 403 && BRANCH_CODES.includes(code) && sentBranch && localStorage.getItem(ACTIVE_PHARMACY_KEY)) {
      localStorage.removeItem(ACTIVE_PHARMACY_KEY);
      window.location.assign('/pharmacy');
      return Promise.reject(error);
    }

    const sessionEnded =
      status === 401 || (status === 403 && SESSION_ENDING_CODES.includes(code));

    if (sessionEnded && !isLoginRequest && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('memberships');
      localStorage.removeItem(ACTIVE_PHARMACY_KEY);
      if (window.location.pathname !== '/login') {
        // Full reload resets in-memory auth state in AuthContext.
        const from = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?session=expired&from=${encodeURIComponent(from)}`);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
