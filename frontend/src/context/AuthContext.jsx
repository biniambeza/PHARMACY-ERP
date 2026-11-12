import { createContext, useContext, useState } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = async (email, password) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user: userData, token: userToken } = res.data;

      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', userToken);

      setUser(userData);
      setToken(userToken);
      setLoading(false);
      return { success: true, user: userData };
    } catch (err) {
      setLoading(false);
      const message = !err.response
        ? 'Cannot reach the server. Make sure the backend is running and VITE_API_URL is correct.'
        : err.response.data?.message || 'Login failed. Please check your credentials.';
      setError(message);
      return { success: false, message };
    }
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
    setToken(null);
    setError('');
  };

  const clearError = () => setError('');

  // Replace the stored token and/or merge user fields, e.g. after a password
  // change (the server revokes old tokens and returns a new one).
  const updateSession = ({ token: newToken, user: userUpdates } = {}) => {
    if (newToken) {
      localStorage.setItem('token', newToken);
      setToken(newToken);
    }
    if (userUpdates) {
      setUser((prev) => {
        const next = { ...prev, ...userUpdates };
        localStorage.setItem('user', JSON.stringify(next));
        return next;
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        logout,
        clearError,
        setUser,
        updateSession,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isPharmacist: user?.role === 'pharmacist',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
