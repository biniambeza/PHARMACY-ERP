import { createContext } from 'react';

// The context object lives in its own module so AuthContext.jsx only exports
// components (keeps React Fast Refresh working).
export const AuthContext = createContext();

// Window event dispatched by logout() (also when another tab logged out) so modules can drop
// per-user / per-pharmacy caches, e.g. the receipt's pharmacy profile.
export const AUTH_LOGOUT_EVENT = 'erp-auth-logout';
