/**
 * apiClient.ts
 *
 * A centralized fetch wrapper that:
 * 1. Attaches the in-memory JWT access token from AuthContext to every request.
 * 2. On 401, attempts ONE silent refresh via the HttpOnly cookie.
 * 3. If the refresh fails, logs the user out and redirects to /auth.
 *    It NEVER calls /refresh again after a failed refresh — no infinite loop.
 */

import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { API_BASE } from './config';

// Re-export so any existing import of API_BASE from apiClient still resolves.
export { API_BASE };

/** React hook returning a pre-configured fetch function bound to the current auth session. */
export function useApiClient() {
  const { getToken, logout } = useAuth();
  const navigate = useNavigate();

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = await getToken();

    if (!token) {
      // No token and refresh failed — send user to auth
      navigate('/auth', { replace: true });
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      // Access token expired — attempt exactly one silent refresh
      const newToken = await getToken(); // getToken() calls silentRefresh if null
      if (!newToken) {
        // Refresh also failed — log out, do NOT retry
        await logout();
        navigate('/auth', { replace: true });
        throw new Error('Session expired');
      }

      // Retry the original request with the new token
      return fetch(`${API_BASE}${url}`, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        },
      });
    }

    return response;
  }, [getToken, logout, navigate]);

  return apiFetch;
}
