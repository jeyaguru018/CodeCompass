/**
 * config.ts
 *
 * Single source of truth for the backend API base URL.
 * Change this one constant to point the entire frontend at a different host
 * (e.g., production, staging) without touching any component or hook.
 *
 * Used by:
 *   - AuthContext.tsx  (auth endpoints — login, register, refresh, logout)
 *   - apiClient.ts     (all authenticated API calls)
 *   - SharedChatPage.tsx (public endpoint — no auth required)
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8081';
