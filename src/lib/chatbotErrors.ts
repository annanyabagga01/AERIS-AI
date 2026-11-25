export type ChatbotErrorCategory =
  | 'network'
  | 'timeout'
  | 'not_found'
  | 'config'
  | 'quota'
  | 'server'
  | 'unexpected';

export interface ChatbotErrorDescriptor {
  category: ChatbotErrorCategory;
  title: string;
  message: string;
  httpStatus?: number;
  retryable: boolean;
  timestampIso: string;
}

function scrubSensitiveData(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export function classifyChatbotError(params: {
  error?: unknown;
  httpStatus?: number;
  serverMessage?: string | null;
  isOffline?: boolean;
}): ChatbotErrorDescriptor {
  const timestampIso = new Date().toISOString();
  const status = params.httpStatus;
  const rawServerMsg = params.serverMessage
    ? scrubSensitiveData(params.serverMessage.trim())
    : '';
  const rawErrMsg =
    params.error instanceof Error
      ? scrubSensitiveData(params.error.message.trim())
      : typeof params.error === 'string'
      ? scrubSensitiveData(params.error.trim())
      : '';
  const errName = params.error instanceof Error ? params.error.name : '';
  const combinedLower = `${rawServerMsg} ${rawErrMsg}`.toLowerCase();

  // 1. Offline or browser-level network failure (TypeError: Failed to fetch / NetworkError)
  if (
    params.isOffline ||
    combinedLower.includes('failed to fetch') ||
    combinedLower.includes('networkerror') ||
    combinedLower.includes('network request failed') ||
    combinedLower.includes('load failed') ||
    combinedLower.includes('err_internet_disconnected') ||
    status === 502
  ) {
    return {
      category: 'network',
      title: 'Network Connection Issue',
      message:
        rawServerMsg ||
        'Unable to reach the AERIS AI backend. Check your internet connection and click Retry.',
      httpStatus: status,
      retryable: true,
      timestampIso,
    };
  }

  // 2. Request timeout / abort
  if (
    errName === 'TimeoutError' ||
    errName === 'AbortError' ||
    status === 504 ||
    combinedLower.includes('timed out') ||
    combinedLower.includes('operation was aborted')
  ) {
    return {
      category: 'timeout',
      title: 'AI Response Timed Out',
      message:
        rawServerMsg ||
        'The AI assistant took too long to respond. Click Retry to send your message again.',
      httpStatus: status,
      retryable: true,
      timestampIso,
    };
  }

  // 3. Missing route or unsupported city (HTTP 404)
  if (status === 404) {
    const isCityNotFound =
      Boolean(rawServerMsg) &&
      rawServerMsg.toLowerCase().includes('city') &&
      rawServerMsg.toLowerCase().includes('catalog');
    return {
      category: 'not_found',
      title: isCityNotFound
        ? 'Unsupported City Selection (HTTP 404)'
        : 'AI Endpoint Unavailable (HTTP 404)',
      message:
        rawServerMsg ||
        'The chatbot API endpoint (/api/ai/recommendations) was not found. Redeploy the latest serverless functions.',
      httpStatus: 404,
      retryable: false,
      timestampIso,
    };
  }

  // 4. Quota / rate limit (HTTP 429)
  if (
    status === 429 ||
    combinedLower.includes('quota') ||
    combinedLower.includes('resource_exhausted') ||
    combinedLower.includes('rate limit')
  ) {
    return {
      category: 'quota',
      title: 'AI Rate Limit Reached',
      message:
        rawServerMsg ||
        'The Gemini API quota or rate limit was temporarily reached (HTTP 429). Wait a moment and click Retry.',
      httpStatus: status ?? 429,
      retryable: true,
      timestampIso,
    };
  }

  // 5. Missing/invalid server credentials or service unavailable (HTTP 503 / 401 / 403)
  if (
    status === 503 ||
    status === 401 ||
    status === 403 ||
    combinedLower.includes('gemini_api_key') ||
    combinedLower.includes('not configured') ||
    combinedLower.includes('api_key_invalid') ||
    combinedLower.includes('permission_denied')
  ) {
    return {
      category: 'config',
      title: 'AI Service Unavailable',
      message:
        rawServerMsg ||
        rawErrMsg ||
        'Gemini AI service is currently unavailable. Verify GEMINI_API_KEY is configured on the server.',
      httpStatus: status ?? 503,
      retryable: true,
      timestampIso,
    };
  }

  // 6. Other 4xx / 5xx server errors
  if (typeof status === 'number' && status >= 400) {
    return {
      category: 'server',
      title: `AI Request Failed (HTTP ${status})`,
      message:
        rawServerMsg ||
        rawErrMsg ||
        `The AI service returned HTTP ${status}. Please click Retry.`,
      httpStatus: status,
      retryable: status >= 500,
      timestampIso,
    };
  }

  // 7. Unexpected runtime / render error
  return {
    category: 'unexpected',
    title: 'Chatbot Error',
    message:
      rawServerMsg ||
      rawErrMsg ||
      'An unexpected error occurred in the AI assistant. Click Retry or Reset Chatbot.',
    httpStatus: status,
    retryable: true,
    timestampIso,
  };
}
