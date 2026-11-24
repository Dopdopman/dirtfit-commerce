const DEFAULT_API_BASE = 'http://localhost:4000';

let inMemoryAccessToken = null;
let inFlightRefreshPromise = null;
const slowStateListeners = new Set();

export class ApiError extends Error {
  /**
   * Normalized RFC 7807 / HTTP API error for Storefront UI forms and alerts.
   * @param {object} params
   * @param {number} params.status
   * @param {string} params.code
   * @param {string} params.title
   * @param {string} params.detail
   * @param {Array<object>} [params.errors]
   * @param {string|null} [params.requestId]
   */
  constructor({ status, code, title, detail, errors = [], requestId = null }) {
    super(detail || title || code || 'API Error');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
    this.requestId = requestId;
  }
}

/**
 * Store short-lived JWT Access Token strictly in JS memory (never localStorage).
 * @param {string|null} token
 */
export function setAccessToken(token) {
  inMemoryAccessToken = typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * Retrieve in-memory Access Token.
 * @returns {string|null}
 */
export function getAccessToken() {
  return inMemoryAccessToken;
}

/**
 * Clear in-memory Access Token.
 */
export function clearAccessToken() {
  inMemoryAccessToken = null;
}

/**
 * Subscribe to Cold-Start slow-request notifications (> 3000ms).
 * @param {(isWaking: boolean) => void} listener
 * @returns {() => void}
 */
export function subscribeColdStartNotice(listener) {
  slowStateListeners.add(listener);
  return () => {
    slowStateListeners.delete(listener);
  };
}

function notifySlowListeners(isWaking) {
  for (const listener of slowStateListeners) {
    listener(isWaking);
  }
}

/**
 * Resolve browser API base URL.
 * @returns {string}
 */
export function getPublicApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE).replace(/\/+$/, '');
}

/**
 * Resolve server-side internal API base URL for Next.js SSR fetches.
 * @returns {string}
 */
export function getInternalApiBaseUrl() {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_API_BASE
  ).replace(/\/+$/, '');
}

/**
 * Parse a fetch Response JSON body cleanly, returning null if empty (e.g. 204).
 * @param {Response} response
 * @returns {Promise<object|null>}
 */
async function safeParseJson(response) {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Perform a single-flight POST /api/v1/auth/refresh using the HttpOnly Refresh Cookie.
 * Multiple concurrent 401 requests await the exact same refresh promise.
 * @param {typeof fetch} fetchImpl
 * @param {string} baseUrl
 * @returns {Promise<string|null>}
 */
export async function refreshAccessTokenSingleFlight(
  fetchImpl = fetch,
  baseUrl = getPublicApiBaseUrl()
) {
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    try {
      const res = await fetchImpl(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: '{}',
      });
      if (!res.ok) {
        clearAccessToken();
        return null;
      }
      const parsed = await safeParseJson(res);
      const token = parsed?.data?.accessToken ?? null;
      setAccessToken(token);
      return token;
    } catch {
      clearAccessToken();
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

/**
 * Client-side API wrapper supporting credentials: 'include', memory JWT,
 * Single-Flight Silent Refresh Queue on 401, RFC 7807 parsing, and Cold-Start indicator.
 * @param {string} path
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.body]
 * @param {Record<string, string>} [options.headers]
 * @param {boolean} [options.skipAuthRetry]
 * @param {boolean} [options.rawEnvelope]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.baseUrl]
 * @returns {Promise<object|Array<object>|null>}
 */
export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    skipAuthRetry = false,
    rawEnvelope = false,
    fetchImpl = fetch,
    baseUrl = getPublicApiBaseUrl(),
  } = options;

  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  let slowTimer = null;
  let activeSlowCounted = false;

  if (typeof window !== 'undefined') {
    slowTimer = setTimeout(() => {
      activeSlowCounted = true;
      notifySlowListeners(true);
    }, 3000);
  }

  const execute = async (tokenOverride) => {
    const reqHeaders = {
      ...headers,
    };
    if (body !== undefined && !reqHeaders['content-type']) {
      reqHeaders['content-type'] = 'application/json';
    }
    const token = tokenOverride ?? getAccessToken();
    if (token) {
      reqHeaders.authorization = `Bearer ${token}`;
    }

    return fetchImpl(url, {
      method,
      credentials: 'include',
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  };

  try {
    let response = await execute();

    const isAuthEndpoint =
      path.includes('/auth/login') ||
      path.includes('/auth/register') ||
      path.includes('/auth/refresh');

    if (response.status === 401 && !skipAuthRetry && !isAuthEndpoint) {
      const refreshedToken = await refreshAccessTokenSingleFlight(fetchImpl, baseUrl);
      if (refreshedToken) {
        response = await execute(refreshedToken);
      }
    }

    const parsed = await safeParseJson(response);

    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        code: parsed?.code || 'HTTP_ERROR',
        title: parsed?.title || response.statusText || 'Request failed',
        detail: parsed?.detail || `API responded with HTTP ${response.status}.`,
        errors: Array.isArray(parsed?.errors) ? parsed.errors : [],
        requestId: parsed?.requestId ?? null,
      });
    }

    if (rawEnvelope) {
      return parsed;
    }
    return parsed && 'data' in parsed ? parsed.data : parsed;
  } finally {
    if (slowTimer) {
      clearTimeout(slowTimer);
    }
    if (activeSlowCounted) {
      notifySlowListeners(false);
    }
  }
}

/**
 * Server Component fetch helper targeting INTERNAL_API_URL cleanly with ISR/no-store fallback.
 * @param {string} path
 * @param {object} [options]
 * @param {number} [options.revalidate]
 * @returns {Promise<object|null>}
 */
export async function fetchServerApi(path, { revalidate = 60 } = {}) {
  const baseUrl = getInternalApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      next: revalidate > 0 ? { revalidate } : undefined,
      cache: revalidate === 0 ? 'no-store' : undefined,
    });
    if (!res.ok) {
      return null;
    }
    const json = await safeParseJson(res);
    return json;
  } catch {
    return null;
  }
}
