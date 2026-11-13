import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext, AUTH_LOGOUT_EVENT } from './authContextObject';
import api, { ACTIVE_PHARMACY_KEY } from '../api/axios';
import { roleCan } from '../config/permissions';

const MEMBERSHIPS_KEY = 'memberships';
const LOGOUT_TIMEOUT_MS = 4000;
// Per-user POS data in localStorage (components/pos/posUtils.js): held carts and the cached shift,
// keyed `${prefix}${pharmacyId}.${userId}`.
const POS_USER_KEY_PREFIXES = ['pos.held.', 'pos.shift.'];

// Removes the POS keys of this user (and keys saved without a user) on logout. Other users'
// keys are left: they are only ever read by their owner.
const clearUserPosData = (userId) => {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !POS_USER_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
      if ((userId && key.endsWith(`.${userId}`)) || key.endsWith('.none')) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // storage unavailable
  }
};

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// Usable branches: active memberships of pharmacies that are not archived.
const usableBranches = (memberships) =>
  (memberships || []).filter((m) => m.active !== false && m.pharmacy?.status !== 'archived');

// Picks the stored branch when still valid, otherwise the first active one.
const pickActivePharmacyId = (memberships, preferredId) => {
  const branches = usableBranches(memberships);
  if (preferredId && branches.some((m) => String(m.pharmacyId) === String(preferredId))) {
    return String(preferredId);
  }
  const first = branches.find((m) => m.pharmacy?.status === 'active') || branches[0];
  return first ? String(first.pharmacyId) : null;
};

const persistActivePharmacyId = (id) => {
  if (id) localStorage.setItem(ACTIVE_PHARMACY_KEY, id);
  else localStorage.removeItem(ACTIVE_PHARMACY_KEY);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readJson('user', null));
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [memberships, setMemberships] = useState(() => readJson(MEMBERSHIPS_KEY, []));
  const [activePharmacyId, setActivePharmacyId] = useState(() => localStorage.getItem(ACTIVE_PHARMACY_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const applyMemberships = useCallback((list, preferredId) => {
    const next = Array.isArray(list) ? list : [];
    localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(next));
    setMemberships(next);
    const activeId = pickActivePharmacyId(next, preferredId);
    persistActivePharmacyId(activeId);
    setActivePharmacyId(activeId);
  }, []);

  // Refresh memberships (roles / branches) once per page load, e.g. for
  // sessions created before memberships existed or after a role change.
  useEffect(() => {
    if (!token || !user || user.role !== 'pharmacist') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/auth/me');
        if (!cancelled && Array.isArray(res.data?.memberships)) {
          applyMemberships(res.data.memberships, localStorage.getItem(ACTIVE_PHARMACY_KEY));
        }
      } catch {
        // 401/403 are handled globally by the axios interceptor
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Second login step: set when the password was right but the account uses
  // two-factor login. Kept in memory only (expires server-side after ~5 min).
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(null);

  const loginErrorMessage = (err, fallback) =>
    !err.response
      ? 'Cannot reach the server. Make sure the backend is running and VITE_API_URL is correct.'
      : err.response.data?.message || fallback;

  // Stores a successful login response ({ user, token, memberships }).
  const applyLoginResponse = (data) => {
    const { user: userData, token: userToken, memberships: userMemberships } = data;

    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', userToken);

    if (userData.role === 'pharmacist') {
      applyMemberships(userMemberships || [], localStorage.getItem(ACTIVE_PHARMACY_KEY));
    } else {
      applyMemberships([], null);
    }

    setUser(userData);
    setToken(userToken);
    return userData;
  };

  // Resolves { success, user } or, for 2FA accounts, { success: true, twoFactorRequired: true };
  // then call completeTwoFactor({ code } | { recoveryCode }).
  const login = async (email, password) => {
    setLoading(true);
    setError('');
    setTwoFactorChallenge(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data?.twoFactorRequired) {
        setTwoFactorChallenge({ token: res.data.challengeToken, email });
        setLoading(false);
        return { success: true, twoFactorRequired: true };
      }
      const userData = applyLoginResponse(res.data);
      setLoading(false);
      return { success: true, user: userData };
    } catch (err) {
      setLoading(false);
      const message = loginErrorMessage(err, 'Login failed. Please check your credentials.');
      setError(message);
      return { success: false, message };
    }
  };

  const completeTwoFactor = async ({ code, recoveryCode } = {}) => {
    if (!twoFactorChallenge) {
      return { success: false, expired: true, message: 'Your sign-in attempt expired. Please sign in again.' };
    }
    setLoading(true);
    setError('');
    try {
      const body = { challengeToken: twoFactorChallenge.token };
      if (recoveryCode) body.recoveryCode = recoveryCode;
      else body.code = code;
      const res = await api.post('/auth/login/2fa', body);
      setTwoFactorChallenge(null);
      const userData = applyLoginResponse(res.data);
      setLoading(false);
      return { success: true, user: userData, recoveryCodesRemaining: res.data.recoveryCodesRemaining };
    } catch (err) {
      setLoading(false);
      const status = err.response?.status;
      // An expired / invalid challenge (not a wrong code) sends the user back to step 1.
      const expired = status === 401 && err.response?.data?.code !== 'INVALID_2FA_CODE';
      if (expired || status === 403) setTwoFactorChallenge(null);
      const message = loginErrorMessage(err, 'Verification failed. Please try again.');
      setError(message);
      return { success: false, expired, status, message };
    }
  };

  const cancelTwoFactor = () => {
    setTwoFactorChallenge(null);
    setError('');
  };

  // Resets the in-memory session (storage is cleared by the caller / the other tab).
  const resetSessionState = useCallback(() => {
    setUser(null);
    setToken(null);
    setMemberships([]);
    setActivePharmacyId(null);
    setError('');
    try {
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
    } catch {
      // ignore
    }
  }, []);

  const logout = () => {
    const currentToken = localStorage.getItem('token');
    const currentUserId = user?._id || readJson('user', null)?._id || null;
    // Revoke the token server-side (bumps tokenVersion). Fire-and-forget: the header is set
    // explicitly because storage is cleared before the request interceptor runs.
    if (currentToken) {
      api
        .post('/auth/logout', null, { timeout: LOGOUT_TIMEOUT_MS, headers: { Authorization: `Bearer ${currentToken}` } })
        .catch(() => {});
    }
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem(MEMBERSHIPS_KEY);
    localStorage.removeItem(ACTIVE_PHARMACY_KEY);
    clearUserPosData(currentUserId);
    resetSessionState();
  };

  // Logout (or a session end) in another tab logs this tab out too.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.storageArea && e.storageArea !== localStorage) return;
      const tokenGone = (e.key === 'token' || e.key === null) && !localStorage.getItem('token');
      if (tokenGone && token) {
        resetSessionState();
        if (window.location.pathname !== '/login') window.location.assign('/login');
      } else if (e.key === 'token' && e.newValue && token && e.newValue !== token) {
        // Another account signed in in another tab: reload so this tab uses one consistent session.
        window.location.reload();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [token, resetSessionState]);

  const clearError = () => setError('');

  // Replace the stored token and/or merge user fields, e.g. after a password
  // change (the server revokes old tokens and returns a new one).
  const updateSession = ({ token: newToken, user: userUpdates, memberships: newMemberships } = {}) => {
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
    if (newMemberships) applyMemberships(newMemberships, activePharmacyId);
  };

  // Switches the active branch. Every request carries it as x-pharmacy-id;
  // a full reload makes every page fetch its data for the new branch.
  const switchPharmacy = (pharmacyId) => {
    const id = pickActivePharmacyId(memberships, pharmacyId);
    if (!id || id !== String(pharmacyId)) return false;
    persistActivePharmacyId(id);
    setActivePharmacyId(id);
    window.location.assign('/pharmacy');
    return true;
  };

  const pharmacies = useMemo(() => usableBranches(memberships), [memberships]);
  const activeMembership = useMemo(
    () => pharmacies.find((m) => String(m.pharmacyId) === String(activePharmacyId)) || null,
    [pharmacies, activePharmacyId]
  );
  const membershipRole = activeMembership?.role || null;

  const can = useCallback(
    (perm) => {
      if (!perm) return true;
      if (user?.role === 'admin') return true;
      return roleCan(membershipRole, perm);
    },
    [user, membershipRole]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        logout,
        // Two-factor login
        twoFactorPending: Boolean(twoFactorChallenge),
        twoFactorEmail: twoFactorChallenge?.email || '',
        completeTwoFactor,
        cancelTwoFactor,
        clearError,
        setUser,
        updateSession,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isPharmacist: user?.role === 'pharmacist',
        // Staff roles and branches
        memberships,
        pharmacies,
        activePharmacyId,
        activePharmacy: activeMembership?.pharmacy || null,
        membershipRole,
        can,
        switchPharmacy,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

