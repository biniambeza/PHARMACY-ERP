import { createContext } from 'react';

// The context object lives in its own module so AuthContext.jsx only exports
// components (keeps React Fast Refresh working).
export const AuthContext = createContext();
