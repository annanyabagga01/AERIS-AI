export interface FirebaseClientConfig {
  projectId?: string;
  appId?: string;
  apiKey?: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export type FirebaseConfigSource = 'applet-config' | 'env' | 'none';

export interface ResolvedFirebaseConfig {
  configured: boolean;
  source: FirebaseConfigSource;
  config: FirebaseClientConfig;
  warnings: string[];
  missingEnvVars: string[];
}

export interface FirebasePublicStatus {
  configured: boolean;
  source: FirebaseConfigSource;
  projectId: string | null;
  authDomain: string | null;
  databaseId: string;
  hasNamedDatabase: boolean;
  warnings: string[];
  missingEnvVars: string[];
  initError?: string | null;
}

const MASKED_BULLET_REGEX = /[\u2022\u25CF\u25AA\u25E6\u2024\u2027\u2219]/;
const MASKED_ASTERISK_RUN_REGEX = /^\*{4,}$/;
const VALID_ASCII_HOSTNAME_REGEX =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const VALID_FIREBASE_PROJECT_ID_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i;

export function hasMaskedCharacters(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) return false;
  return (
    MASKED_BULLET_REGEX.test(trimmed) || MASKED_ASTERISK_RUN_REGEX.test(trimmed)
  );
}

export function cleanFirebaseConfigValue(value: string | undefined): string {
  let trimmed = (value ?? '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (
    !trimmed ||
    hasMaskedCharacters(trimmed) ||
    trimmed.startsWith('YOUR_') ||
    trimmed === 'your-project-id' ||
    trimmed === 'your-project-id.firebaseapp.com' ||
    trimmed === 'your-project-id.firebasestorage.app' ||
    trimmed === 'remixed-project-id' ||
    trimmed === 'undefined' ||
    trimmed === 'null'
  ) {
    return '';
  }
  return trimmed;
}

export function cleanFirebaseAuthDomain(value: string | undefined): string {
  let cleaned = cleanFirebaseConfigValue(value);
  if (!cleaned) return '';

  // Strip accidental protocol or trailing path/slash if pasted as a full URL
  cleaned = cleaned
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();

  // Reject Punycode (xn--) or any non-ASCII hostname so Firebase never opens a broken xn-- handler URL
  if (
    !cleaned ||
    cleaned.startsWith('xn--') ||
    cleaned.includes('.xn--') ||
    !VALID_ASCII_HOSTNAME_REGEX.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function cleanFirebaseProjectId(value: string | undefined): string {
  const cleaned = cleanFirebaseConfigValue(value);
  if (!cleaned || !VALID_FIREBASE_PROJECT_ID_REGEX.test(cleaned)) {
    return '';
  }
  return cleaned;
}

function normalizeDatabaseId(value: string | undefined): string | undefined {
  const cleaned = cleanFirebaseConfigValue(value);
  if (!cleaned || cleaned === '(default)') {
    return undefined;
  }
  return cleaned;
}

function sanitizeClientConfig(raw?: FirebaseClientConfig): FirebaseClientConfig {
  if (!raw) return {};
  const sanitized: FirebaseClientConfig = {
    apiKey: cleanFirebaseConfigValue(raw.apiKey),
    authDomain: cleanFirebaseAuthDomain(raw.authDomain),
    projectId: cleanFirebaseProjectId(raw.projectId),
    storageBucket: cleanFirebaseConfigValue(raw.storageBucket),
    messagingSenderId: cleanFirebaseConfigValue(raw.messagingSenderId),
    appId: cleanFirebaseConfigValue(raw.appId),
    measurementId: cleanFirebaseConfigValue(raw.measurementId),
    firestoreDatabaseId: normalizeDatabaseId(raw.firestoreDatabaseId),
  };
  return sanitized;
}

function listMaskedOrMalformedEnvVars(
  raw?: FirebaseClientConfig
): { masked: string[]; invalidAuthDomain: boolean } {
  if (!raw) return { masked: [], invalidAuthDomain: false };
  const masked: string[] = [];
  const entries: Array<[string, string | undefined]> = [
    ['VITE_FIREBASE_API_KEY', raw.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', raw.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', raw.projectId],
    ['VITE_FIREBASE_STORAGE_BUCKET', raw.storageBucket],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', raw.messagingSenderId],
    ['VITE_FIREBASE_APP_ID', raw.appId],
    ['VITE_FIREBASE_DATABASE_ID', raw.firestoreDatabaseId],
  ];
  for (const [envName, val] of entries) {
    if (hasMaskedCharacters(val)) {
      masked.push(envName);
    }
  }
  const rawDomain = (raw.authDomain ?? '').trim();
  const invalidAuthDomain = Boolean(
    rawDomain &&
      !hasMaskedCharacters(rawDomain) &&
      !cleanFirebaseAuthDomain(rawDomain) &&
      cleanFirebaseConfigValue(rawDomain)
  );
  return { masked, invalidAuthDomain };
}

function isCompleteClientConfig(cfg: FirebaseClientConfig): boolean {
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

function listMissingRequiredEnvVars(cfg: FirebaseClientConfig): string[] {
  const missing: string[] = [];
  if (!cfg.apiKey) missing.push('VITE_FIREBASE_API_KEY');
  if (!cfg.authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!cfg.projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!cfg.appId) missing.push('VITE_FIREBASE_APP_ID');
  return missing;
}

function checkConfigConsistency(
  cfg: FirebaseClientConfig,
  warnings: string[]
): void {
  if (!cfg.projectId || !cfg.authDomain) return;
  const domain = cfg.authDomain.toLowerCase();
  const project = cfg.projectId.toLowerCase();
  if (
    (domain.endsWith('.firebaseapp.com') || domain.endsWith('.web.app')) &&
    !domain.startsWith(`${project}.`)
  ) {
    warnings.push(
      `Firebase authDomain (${cfg.authDomain}) does not match projectId (${cfg.projectId}).`
    );
  }
}

/**
 * Resolves Firebase Web SDK configuration atomically so fields from two
 * different Firebase projects are never mixed together.
 *
 * Precedence:
 * 1. Complete provisioned `firebase-applet-config.json` (authoritative in AI Studio,
 *    matching the provisioned Firestore database, deployed rules, and allowlisted
 *    preview domains).
 * 2. Complete `VITE_FIREBASE_*` environment variables (for standalone deployments
 *    such as Vercel where `firebase-applet-config.json` is intentionally omitted).
 */
export function resolveFirebaseClientConfig(params: {
  appletConfig?: FirebaseClientConfig;
  envConfig?: FirebaseClientConfig;
}): ResolvedFirebaseConfig {
  const warnings: string[] = [];
  const applet = sanitizeClientConfig(params.appletConfig);
  const env = sanitizeClientConfig(params.envConfig);

  const appletComplete = isCompleteClientConfig(applet);
  const envComplete = isCompleteClientConfig(env);

  if (appletComplete) {
    if (env.projectId && env.projectId !== applet.projectId) {
      warnings.push(
        `Using provisioned Firebase project "${applet.projectId}" from firebase-applet-config.json instead of differing VITE_FIREBASE_PROJECT_ID "${env.projectId}".`
      );
    }
    checkConfigConsistency(applet, warnings);
    return {
      configured: true,
      source: 'applet-config',
      config: applet,
      warnings,
      missingEnvVars: [],
    };
  }

  if (envComplete) {
    const envIssues = listMaskedOrMalformedEnvVars(params.envConfig);
    if (envIssues.masked.length > 0) {
      warnings.push(
        `Masked placeholder characters (•••) detected in optional Firebase environment variable(s): ${envIssues.masked.join(', ')}. Replace them with unmasked values from Firebase Console and redeploy.`
      );
    }
    checkConfigConsistency(env, warnings);
    return {
      configured: true,
      source: 'env',
      config: env,
      warnings,
      missingEnvVars: [],
    };
  }

  const missingEnvVars = listMissingRequiredEnvVars(env);
  const envIssues = listMaskedOrMalformedEnvVars(params.envConfig);
  const failureWarnings: string[] = [];
  if (envIssues.masked.length > 0) {
    failureWarnings.push(
      `Masked bullet/placeholder characters (•••) were pasted into: ${envIssues.masked.join(', ')}. Replace them with the unmasked plain-text values from Firebase Console (e.g. VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com) in Vercel Environment Variables and redeploy.`
    );
  }
  if (envIssues.invalidAuthDomain) {
    failureWarnings.push(
      'VITE_FIREBASE_AUTH_DOMAIN is not a valid ASCII Firebase hostname (expected "<project-id>.firebaseapp.com").'
    );
  }
  failureWarnings.push(
    `Incomplete Firebase Web SDK configuration. Missing or invalid environment variables: ${missingEnvVars.join(', ')}.`
  );

  return {
    configured: false,
    source: 'none',
    config: {},
    warnings: failureWarnings,
    missingEnvVars,
  };
}

function extractFirebaseErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) {
      return code.trim();
    }
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const match = msg.match(/\((auth\/[a-z0-9-]+)\)/i);
  if (match) return match[1].toLowerCase();
  return '';
}

function scrubSensitiveTokens(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
}

export function formatFirebaseAuthError(
  error: unknown,
  context?: {
    projectId?: string | null;
    authDomain?: string | null;
    currentHost?: string | null;
  }
): string {
  const code = extractFirebaseErrorCode(error);
  const projectLabel = context?.projectId
    ? `project "${context.projectId}"`
    : 'your Firebase project';
  const hostLabel = context?.currentHost || 'this app domain';

  switch (code) {
    case 'auth/configuration-not-found':
      return `Firebase Authentication is not configured for ${projectLabel} (auth/configuration-not-found). In Firebase Console → Authentication → Get Started → Sign-in method, enable Google Sign-In and save a project support email.`;
    case 'auth/operation-not-allowed':
      return `Google Sign-In is currently disabled for ${projectLabel} (auth/operation-not-allowed). Open Firebase Console → Authentication → Sign-in method → Google, toggle Enable, and save.`;
    case 'auth/unauthorized-domain':
      return `This host (${hostLabel}) is not listed under Authorized Domains for ${projectLabel} (auth/unauthorized-domain). Add "${hostLabel}" in Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and click "Sign in with Google" again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing sign-in. Click "Sign in with Google" whenever you are ready.';
    case 'auth/cancelled-popup-request':
      return 'A previous Google sign-in request was superseded. Please click "Sign in with Google" again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication. Check your internet connection and retry.';
    case 'auth/invalid-api-key':
      return `The Firebase Web API key for ${projectLabel} was rejected (auth/invalid-api-key). Verify VITE_FIREBASE_API_KEY and its HTTP referrer/API restrictions in Google Cloud Console.`;
    case 'auth/internal-error':
      return `Firebase Authentication returned an internal error for ${projectLabel} (auth/internal-error). Verify VITE_FIREBASE_AUTH_DOMAIN matches your Firebase project, Google Sign-In is enabled, and "${hostLabel}" is in Authorized Domains.`;
    case 'auth/operation-not-supported-in-this-environment':
      return 'Google sign-in popup is not supported in this browser context. Open the site directly over HTTPS in a standard browser tab and retry.';
    case 'auth/user-disabled':
      return 'This Google account has been disabled in Firebase Authentication.';
    default: {
      const rawMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
          ? error
          : 'Google sign-in could not complete.';
      return scrubSensitiveTokens(rawMessage);
    }
  }
}

/**
 * Formats Firestore errors safely for visible UI alerts, ensuring structured
 * diagnostic JSON (which may include `authInfo.email` for console debugging)
 * is never displayed on screen.
 */
export function formatFirestoreUiError(
  error: unknown,
  context?: { projectId?: string | null; databaseId?: string | null }
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'Unable to sync with Firestore right now.';

  let underlying = raw;
  let operationType: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
    if (parsed && typeof parsed.error === 'string') {
      underlying = parsed.error;
    }
    if (parsed && typeof parsed.operationType === 'string') {
      operationType = parsed.operationType.toLowerCase();
    }
  } catch {
    // Plain error message
  }

  const lower = underlying.toLowerCase();
  if (
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied')
  ) {
    const projectLabel = context?.projectId
      ? `project "${context.projectId}"`
      : 'your Firebase project';
    const dbLabel = context?.databaseId || '(default)';
    const rulesUrl = context?.projectId
      ? `https://console.firebase.google.com/project/${encodeURIComponent(
          context.projectId
        )}/firestore/databases/${encodeURIComponent(dbLabel)}/rules`
      : null;

    if (operationType === 'list' || operationType === 'get') {
      return rulesUrl
        ? `Firestore access denied by security rules on database "${dbLabel}" in ${projectLabel}. Publish the repository's firestore.rules at ${rulesUrl} and reload.`
        : `Firestore access denied by security rules on database "${dbLabel}" in ${projectLabel}. Publish the repository's firestore.rules in Firebase Console → Firestore Database → Rules for database "${dbLabel}" and reload.`;
    }
    return rulesUrl
      ? `Firestore access denied by security rules on database "${dbLabel}" in ${projectLabel}. Ensure firestore.rules is published at ${rulesUrl}, and confirm you are signed in with a verified Google account and using a valid anonymous handle.`
      : `Firestore access denied by security rules on database "${dbLabel}" in ${projectLabel}. Confirm firestore.rules is published in Firebase Console, and that you are signed in with a verified Google account and using a valid anonymous handle.`;
  }
  if (lower.includes('quota exceeded')) {
    return 'Firestore free-tier daily quota was exceeded. Quota resets tomorrow; Demo Community Preview remains available.';
  }
  if (lower.includes('client is offline') || lower.includes('unavailable')) {
    return 'Firestore is temporarily unreachable. Check your connection and retry.';
  }
  return scrubSensitiveTokens(underlying);
}
