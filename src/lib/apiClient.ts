/**
 * Builds an API URL using same-origin relative paths by default, or an optional
 * `VITE_API_BASE_URL` when frontend and backend are deployed on separate origins.
 */
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const rawBase =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim()
      : '';

  if (!rawBase || rawBase.startsWith('YOUR_')) {
    return normalizedPath;
  }

  const trimmedBase = rawBase.replace(/\/+$/, '');
  return `${trimmedBase}${normalizedPath}`;
}
