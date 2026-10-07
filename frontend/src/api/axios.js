import axios from 'axios';

const rawUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').trim();
const cleanUrl = rawUrl.replace(/\/+$/, '');
const baseURL = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach JWT token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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

export default api;
