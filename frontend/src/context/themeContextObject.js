import { createContext } from 'react';

// The context object lives in its own module so ThemeContext.jsx only exports
// components (keeps React Fast Refresh working).
export const ThemeContext = createContext();
