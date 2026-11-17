import axios from 'axios';

/**
 * API base URL.
 *  - VITE_API_URL wins when set (e.g. https://your-api.onrender.com/api/v1).
 *  - Otherwise: the local API in development, and same-origin `/api/v1` in
 *    production — which the Vercel rewrite in vercel.json proxies to Render,
 *    keeping the refresh cookie first-party.
 */
const baseURL = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api/v1' : '/api/v1')
).replace(/\/+$/, '');

export const api = axios.create({ baseURL, withCredentials: true });

// Access token is held in memory (not localStorage) to reduce XSS exposure.
let accessToken: string | null = null;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Called when a silent refresh fails, so the app can drop the user back to /login.
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: (() => void) | null) => {
  onSessionExpired = fn;
};

// On a 401, try one silent refresh, then retry the original request.
let refreshing: Promise<string> | null = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      try {
        refreshing =
          refreshing ??
          api.post('/auth/refresh').then((r) => {
            setAccessToken(r.data.accessToken);
            return r.data.accessToken as string;
          });
        const token = await refreshing;
        refreshing = null;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        setAccessToken(null);
        onSessionExpired?.();
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  },
);
