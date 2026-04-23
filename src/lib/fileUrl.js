/**
 * Converts a relative /api/files/... URL to an absolute URL when VITE_API_BASE is set.
 * Used when deploying the frontend to a different origin than the backend (e.g. static hosting).
 */
const API_BASE = import.meta.env.VITE_API_BASE || '';
const IS_DEV = import.meta.env.DEV;
const USE_API_BASE = API_BASE && !IS_DEV && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(\/|$)/i.test(API_BASE);
const ACCESS_TOKEN_KEY = 'digiscribe_access_token';

function appendQueryParam(rawUrl, key, value) {
  if (!rawUrl || !value) return rawUrl;
  try {
    const isAbsolute = /^https?:\/\//i.test(rawUrl);
    const parsed = new URL(rawUrl, window.location.origin);
    parsed.searchParams.set(key, value);
    if (isAbsolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const joiner = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${joiner}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function getCachedAccessToken() {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function fileUrl(url) {
  if (!url) return url;
  let resolved = url;
  if (USE_API_BASE && typeof resolved === 'string' && resolved.startsWith('/api/')) {
    resolved = API_BASE + resolved;
  }

  if (typeof resolved === 'string' && resolved.includes('/api/files/')) {
    const token = getCachedAccessToken();
    if (token) {
      resolved = appendQueryParam(resolved, 'access_token', token);
    }
  }

  return resolved;
}

export function fileDownloadUrl(url) {
  const resolved = fileUrl(url);
  if (!resolved) return resolved;
  return appendQueryParam(resolved, 'download', '1');
}
