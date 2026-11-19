/**
 * Server-side secret redaction utilities to prevent accidental leakage of
 * API keys or tokens into logs, HTTP responses, or error messages.
 */

const KNOWN_SECRET_ENV_KEYS = ['GEMINI_API_KEY'] as const;

/**
 * Strips known server secrets, Google API keys, Bearer tokens, and query/header
 * key tokens from strings before logging or returning error messages to clients.
 */
export function redactSecrets(
  input: string,
  env: Record<string, string | undefined> = process.env
): string {
  if (!input) return '';
  let sanitized = input;

  for (const key of KNOWN_SECRET_ENV_KEYS) {
    const val = env[key]?.trim();
    if (val && val.length >= 6 && !val.startsWith('YOUR_')) {
      sanitized = sanitized.split(val).join(`[REDACTED:${key}]`);
      try {
        const encoded = encodeURIComponent(val);
        if (encoded !== val) {
          sanitized = sanitized.split(encoded).join(`[REDACTED:${key}]`);
        }
      } catch {
        // Ignore URI encoding edge cases
      }
    }
  }

  sanitized = sanitized
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED:GOOGLE_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(
      /(api[_-]?key|x-api-key|token|secret)\s*[:=]\s*([^\s&'",;]+)/gi,
      '$1=[REDACTED]'
    );

  return sanitized;
}
