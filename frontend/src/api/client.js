/**
 * The ONE place the app talks HTTP. Every request goes to the documented
 * /api/v1 REST API; no payment or AI provider is ever called from the browser.
 * Parses the standard envelopes:
 *   { success: true, data, meta }  ->  resolves { data, meta, headers }
 *   { success: false, error, requestId } -> throws ApiError
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

let tokenGetter = () => null;
let onUnauthorized = () => {};

/** Wired by AuthContext so the client can attach the token and react to 401s. */
export function configureClient({ getToken, handleUnauthorized }) {
  tokenGetter = getToken;
  onUnauthorized = handleUnauthorized;
}

export async function request(path, { method = 'GET', body, headers = {}, signal, auth = true } = {}) {
  const token = auth ? tokenGetter() : null;
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: navigator.onLine ? 'Cannot reach the server. Please try again.' : 'You are offline.' });
  }

  if (res.status === 204) return { data: null, meta: undefined, headers: res.headers };

  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }

  if (!res.ok || !json || json.success !== true) {
    const error = json?.error || {};
    const apiError = new ApiError({
      status: res.status,
      code: error.code || `HTTP_${res.status}`,
      message: error.message || `Request failed (${res.status})`,
      details: error.details,
      requestId: json?.requestId,
    });
    if (res.status === 401 && token) onUnauthorized(apiError);
    throw apiError;
  }
  return { data: json.data, meta: json.meta, headers: res.headers };
}

export const api = {
  get: (p, o) => request(p, { ...o, method: 'GET' }),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  del: (p, o) => request(p, { ...o, method: 'DELETE' }),
};
