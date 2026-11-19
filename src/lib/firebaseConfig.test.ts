import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatFirebaseAuthError,
  formatFirestoreUiError,
  resolveFirebaseClientConfig,
} from './firebaseConfig.ts';

const VALID_APPLET_CONFIG = {
  projectId: 'resonant-reference-1c9s2',
  appId: '1:28022940405:web:bed76f27da23470284dbbc',
  apiKey: 'AIzaSyFakeAppletKeyExample1234567890',
  authDomain: 'resonant-reference-1c9s2.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-be7f3ae2-27ce-44f6-a868-d9882cdd90e2',
  storageBucket: 'resonant-reference-1c9s2.firebasestorage.app',
  messagingSenderId: '28022940405',
};

const VALID_ENV_CONFIG = {
  projectId: 'aeris-ai-967a7',
  appId: '1:900141604250:web:90bf460446bdec0acc2e23',
  apiKey: 'AIzaSyFakeEnvKeyExample0987654321098',
  authDomain: 'aeris-ai-967a7.firebaseapp.com',
  firestoreDatabaseId: '(default)',
};

test('prioritizes complete provisioned firebase-applet-config.json over differing VITE_FIREBASE_* env vars', () => {
  const resolved = resolveFirebaseClientConfig({
    appletConfig: VALID_APPLET_CONFIG,
    envConfig: VALID_ENV_CONFIG,
  });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.source, 'applet-config');
  assert.equal(resolved.config.projectId, VALID_APPLET_CONFIG.projectId);
  assert.equal(resolved.config.authDomain, VALID_APPLET_CONFIG.authDomain);
  assert.equal(resolved.config.apiKey, VALID_APPLET_CONFIG.apiKey);
  assert.equal(
    resolved.config.firestoreDatabaseId,
    'ai-studio-be7f3ae2-27ce-44f6-a868-d9882cdd90e2'
  );
  assert.ok(resolved.warnings.some((w) => w.includes('aeris-ai-967a7')));
});

test('falls back cleanly to complete VITE_FIREBASE_* config when applet config is absent and normalizes (default) db id', () => {
  const resolved = resolveFirebaseClientConfig({
    appletConfig: {},
    envConfig: VALID_ENV_CONFIG,
  });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.source, 'env');
  assert.equal(resolved.config.projectId, 'aeris-ai-967a7');
  assert.equal(resolved.config.firestoreDatabaseId, undefined);
  assert.equal(resolved.warnings.length, 0);
});

test('never mixes partial env fields with partial applet fields across projects', () => {
  const resolved = resolveFirebaseClientConfig({
    appletConfig: {
      projectId: 'project-a',
      authDomain: 'project-a.firebaseapp.com',
    },
    envConfig: {
      apiKey: 'AIzaSyFakeEnvKeyExample0987654321098',
      appId: '1:123:web:abc',
    },
  });
  assert.equal(resolved.configured, false);
  assert.equal(resolved.source, 'none');
  assert.deepEqual(resolved.missingEnvVars, [
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
  ]);
});

test('detects authDomain mismatch against projectId', () => {
  const resolved = resolveFirebaseClientConfig({
    appletConfig: {
      ...VALID_APPLET_CONFIG,
      authDomain: 'other-project.firebaseapp.com',
    },
  });
  assert.equal(resolved.configured, true);
  assert.ok(resolved.warnings.some((w) => w.includes('does not match projectId')));
});

test('formats auth/configuration-not-found, auth/operation-not-allowed, auth/unauthorized-domain, and auth/internal-error with actionable steps', () => {
  const notFound = formatFirebaseAuthError(
    { code: 'auth/configuration-not-found', message: 'Firebase: Error (auth/configuration-not-found).' },
    { projectId: 'resonant-reference-1c9s2' }
  );
  assert.match(notFound, /auth\/configuration-not-found/i);
  assert.match(notFound, /Firebase Console/i);
  assert.match(notFound, /Google Sign-In/i);

  const disabled = formatFirebaseAuthError(
    { code: 'auth/operation-not-allowed' },
    { projectId: 'resonant-reference-1c9s2' }
  );
  assert.match(disabled, /disabled/i);
  assert.match(disabled, /Sign-in method/i);

  const unauthDomain = formatFirebaseAuthError(
    { code: 'auth/unauthorized-domain' },
    { projectId: 'aeris-ai-967a7', currentHost: 'aeris-ai-alpha.vercel.app' }
  );
  assert.match(unauthDomain, /Authorized Domains/i);
  assert.match(unauthDomain, /aeris-ai-alpha\.vercel\.app/i);

  const internalErr = formatFirebaseAuthError(
    { code: 'auth/internal-error' },
    { projectId: 'aeris-ai-967a7', currentHost: 'aeris-ai-alpha.vercel.app' }
  );
  assert.match(internalErr, /auth\/internal-error/i);
  assert.match(internalErr, /VITE_FIREBASE_AUTH_DOMAIN/i);
});

test('formatFirestoreUiError never leaks authInfo email from structured Firestore errors', () => {
  const rawStructured = JSON.stringify({
    error: 'Missing or insufficient permissions.',
    operationType: 'list',
    path: 'community_contributions',
    authInfo: {
      userId: 'uid_123',
      email: 'private.user@example.com',
    },
  });
  const safe = formatFirestoreUiError(new Error(rawStructured), {
    projectId: 'aeris-ai-967a7',
    databaseId: 'default',
  });
  assert.doesNotMatch(safe, /private\.user@example\.com/i);
  assert.match(safe, /Firestore access denied/i);
  assert.match(safe, /aeris-ai-967a7/i);
  assert.match(safe, /databases\/default\/rules/i);
  assert.match(safe, /firestore\.rules/i);
});

test('strips accidental wrapping quotes from VITE_FIREBASE_* env values and rejects literal undefined/null', () => {
  const resolved = resolveFirebaseClientConfig({
    appletConfig: {},
    envConfig: {
      projectId: '"aeris-ai-967a7"',
      appId: "'1:900141604250:web:90bf460446bdec0acc2e23'",
      apiKey: ' "AIzaSyFakeEnvKeyExample0987654321098" ',
      authDomain: '"aeris-ai-967a7.firebaseapp.com"',
      firestoreDatabaseId: '"(default)"',
    },
  });
  assert.equal(resolved.configured, true);
  assert.equal(resolved.config.projectId, 'aeris-ai-967a7');
  assert.equal(resolved.config.authDomain, 'aeris-ai-967a7.firebaseapp.com');
  assert.equal(resolved.config.apiKey, 'AIzaSyFakeEnvKeyExample0987654321098');
  assert.equal(resolved.config.firestoreDatabaseId, undefined);

  const bad = resolveFirebaseClientConfig({
    appletConfig: {},
    envConfig: {
      projectId: 'undefined',
      appId: 'null',
      apiKey: 'YOUR_FIREBASE_WEB_API_KEY',
      authDomain: 'your-project-id.firebaseapp.com',
    },
  });
  assert.equal(bad.configured, false);
  assert.equal(bad.missingEnvVars.length, 4);
});

