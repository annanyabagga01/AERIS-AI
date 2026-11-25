const LOCAL_OR_PREVIEW_HOST_PATTERN =
  /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|ais-(?:dev|pre)-[^/]+\.run\.app)$/i;

function isSafeConfiguredApiBase(rawBase: string): boolean {
  try {
    const parsed = new URL(rawBase);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const currentHost = window.location.hostname;
      const isCurrentLocal =
        currentHost === 'localhost' ||
        currentHost === '127.0.0.1' ||
        currentHost === '0.0.0.0';
      if (!isCurrentLocal && LOCAL_OR_PREVIEW_HOST_PATTERN.test(parsed.hostname)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds an API URL using same-origin relative paths by default, or an optional
 * `VITE_API_BASE_URL` when frontend and backend are deployed on separate origins.
 * Production hosts ignore accidental localhost or AI Studio preview base URLs.
 */
export function buildApiUrl(path: string, overrideBase?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const rawBase =
    typeof overrideBase === 'string'
      ? overrideBase.trim()
      : typeof import.meta !== 'undefined' &&
        import.meta.env &&
        typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim()
      : '';

  if (!rawBase || rawBase.startsWith('YOUR_') || !isSafeConfiguredApiBase(rawBase)) {
    return normalizedPath;
  }

  const trimmedBase = rawBase.replace(/\/+$/, '');
  return `${trimmedBase}${normalizedPath}`;
}
