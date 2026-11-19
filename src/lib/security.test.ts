import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSecrets } from '../../server/security.ts';

test('redactSecrets scrubs Google API keys, query-string keys, bearer tokens, and GEMINI_API_KEY', () => {
  const fakeEnv = {
    GEMINI_API_KEY: 'super-secret-gemini-value-12345',
  };

  const googleKeyErr =
    'Request failed with key AIzaSyFakeKeyExample1234567890abcdefg in payload';
  const redactedGoogle = redactSecrets(googleKeyErr, fakeEnv);
  assert.ok(!redactedGoogle.includes('AIzaSy'));
  assert.ok(redactedGoogle.includes('[REDACTED:GOOGLE_API_KEY]'));

  const urlKeyErr =
    'Fetch failed for https://example.com/resource/1234?api-key=secret-key-999999&format=json';
  const redactedUrl = redactSecrets(urlKeyErr, fakeEnv);
  assert.ok(!redactedUrl.includes('secret-key-999999'));
  assert.ok(redactedUrl.includes('api-key=[REDACTED]'));

  const bearerErr =
    'Upstream rejected Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret.sig';
  const redactedBearer = redactSecrets(bearerErr, fakeEnv);
  assert.ok(!redactedBearer.includes('eyJhbGci'));
  assert.ok(redactedBearer.includes('Bearer [REDACTED]'));

  const envErr = 'Gemini error using super-secret-gemini-value-12345';
  const redactedEnv = redactSecrets(envErr, fakeEnv);
  assert.ok(!redactedEnv.includes('super-secret-gemini-value-12345'));
  assert.ok(redactedEnv.includes('[REDACTED:GEMINI_API_KEY]'));
});
