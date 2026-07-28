import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from './config';

interface AuthContextValue {
  /** The JWT access token — lives in memory only, never persisted to localStorage. */
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Returns a valid (possibly refreshed) access token, or null if session is gone. */
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Refresh guard: tracks whether a /refresh call is already in-flight.
   * Prevents concurrent refresh requests and — critically — prevents the
   * 401→refresh→401→refresh infinite loop: if the refresh endpoint itself
   * returns 401, we clear the token and stop, never retrying.
   */
  const isRefreshing = useRef(false);
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const silentRefresh = useCallback(async (): Promise<string | null> => {
    // If a refresh is already in-flight, return the same promise (deduplication)
    if (isRefreshing.current && refreshPromise.current) {
      return refreshPromise.current;
    }

    isRefreshing.current = true;
    refreshPromise.current = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include', // send the HttpOnly cc_refresh cookie
        });

        if (res.ok) {
          const data = await res.json();
          const token = data.token as string;
          setAccessToken(token);
          return token;
        } else {
          // Refresh failed (expired/invalid cookie) — clear state, do NOT retry
          setAccessToken(null);
          return null;
        }
      } catch {
        setAccessToken(null);
        return null;
      } finally {
        isRefreshing.current = false;
        refreshPromise.current = null;
      }
    })();

    return refreshPromise.current;
  }, []);

  // On mount: attempt silent session restore from the HttpOnly cookie
  useEffect(() => {
    silentRefresh().finally(() => setIsLoading(false));
  }, [silentRefresh]);

  /**
   * getToken(): used by API callers throughout the app.
   * Returns the in-memory access token; if it's gone, tries one silent refresh.
   * If that refresh also fails (returns null), the caller gets null — the
   * calling component should redirect to /auth.
   */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    return silentRefresh();
  }, [accessToken, silentRefresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // so the Set-Cookie response header is accepted
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Invalid credentials');
    }
    const data = await res.json();
    setAccessToken(data.token); // access token in memory only
  }, []);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fullName, email, password }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Registration failed');
    }
    const data = await res.json();
    setAccessToken(data.token);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setAccessToken(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      accessToken,
      isLoading,
      isAuthenticated: !!accessToken,
      login,
      register,
      logout,
      getToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
