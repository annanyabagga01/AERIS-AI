import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChatbotError } from './chatbotErrors.ts';

test('classifyChatbotError classifies offline and network failures as retryable network errors', () => {
  const offline = classifyChatbotError({ isOffline: true });
  assert.equal(offline.category, 'network');
  assert.equal(offline.retryable, true);

  const failedFetch = classifyChatbotError({
    error: new TypeError('Failed to fetch'),
  });
  assert.equal(failedFetch.category, 'network');
  assert.equal(failedFetch.retryable, true);

  const badGateway = classifyChatbotError({ httpStatus: 502 });
  assert.equal(badGateway.category, 'network');
  assert.equal(badGateway.httpStatus, 502);
});

test('classifyChatbotError classifies TimeoutError, AbortError, and HTTP 504 as timeout errors', () => {
  const timeoutErr = new Error('The operation was aborted due to timeout');
  timeoutErr.name = 'TimeoutError';
  const result = classifyChatbotError({ error: timeoutErr });
  assert.equal(result.category, 'timeout');
  assert.equal(result.retryable, true);

  const gatewayTimeout = classifyChatbotError({ httpStatus: 504 });
  assert.equal(gatewayTimeout.category, 'timeout');
  assert.equal(gatewayTimeout.httpStatus, 504);
});

test('classifyChatbotError classifies 404, 429, 503 config, and 500 errors and scrubs API keys', () => {
  const notFound = classifyChatbotError({ httpStatus: 404 });
  assert.equal(notFound.category, 'not_found');
  assert.equal(notFound.retryable, false);

  const quota = classifyChatbotError({ httpStatus: 429 });
  assert.equal(quota.category, 'quota');
  assert.equal(quota.retryable, true);

  const missingKey = classifyChatbotError({
    httpStatus: 503,
    serverMessage:
      'GEMINI_API_KEY rejected for key AIzaSySecretExampleKey1234567890',
  });
  assert.equal(missingKey.category, 'config');
  assert.doesNotMatch(missingKey.message, /AIzaSySecretExampleKey1234567890/);
  assert.match(missingKey.message, /\[REDACTED_KEY\]/);

  const serverErr = classifyChatbotError({ httpStatus: 500 });
  assert.equal(serverErr.category, 'server');
  assert.equal(serverErr.retryable, true);
});
