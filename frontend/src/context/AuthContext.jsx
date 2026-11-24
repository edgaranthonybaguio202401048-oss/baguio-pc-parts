import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { configureClient } from '../api/client';
import { AuthApi } from '../api/endpoints';

/**
 * Global auth state: JWT + user (with role). The role here only decides what
 * the UI shows – every protected endpoint is enforced again on the server.
 * localStorage is treated as an untrusted cache; the token is re-checked with
 * GET /auth/me on start-up.
 */
const AuthContext = createContext(null);
const KEY = 'bpc.auth';

function readStored() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { token: null, user: null }; } catch { return { token: null, user: null }; }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readStored);
  const [sessionMessage, setSessionMessage] = useState('');

  const save = useCallback((next) => {
    setAuth(next);
    try {
      if (next.token) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch { /* private mode */ }
  }, []);

  const logout = useCallback((message = '') => {
    save({ token: null, user: null });
    setSessionMessage(message);
  }, [save]);

  // Let the API client attach the token and react to 401 responses.
  useEffect(() => {
    configureClient({
      getToken: () => readStored().token,
      handleUnauthorized: () => logout('Your session expired. Please sign in again.'),
    });
  }, [logout]);

  // Validate a stored token once on load (skipped while offline).
  useEffect(() => {
    if (!auth.token || !navigator.onLine) return;
    // A 401 here triggers handleUnauthorized -> logout
    AuthApi.me().then(({ data }) => save({ token: readStored().token, user: data })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await AuthApi.login(credentials);
    save({ token: data.token, user: data.user });
    setSessionMessage('');
    return data.user;
  }, [save]);

  const register = useCallback(async (body) => {
    const { data } = await AuthApi.register(body);
    save({ token: data.token, user: data.user });
    return data.user;
  }, [save]);

  const value = useMemo(() => ({
    user: auth.user,
    token: auth.token,
    isAuthenticated: Boolean(auth.token),
    isAdmin: auth.user?.role === 'admin',
    login, register, logout, sessionMessage,
  }), [auth, login, register, logout, sessionMessage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
