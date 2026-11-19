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
  hasNamedDatabase: boolean;
  warnings: string[];
  missingEnvVars: string[];
  initError?: string | null;
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
    authDomain: cleanFirebaseConfigValue(raw.authDomain),
    projectId: cleanFirebaseConfigValue(raw.projectId),
    storageBucket: cleanFirebaseConfigValue(raw.storageBucket),
    messagingSenderId: cleanFirebaseConfigValue(raw.messagingSenderId),
    appId: cleanFirebaseConfigValue(raw.appId),
    measurementId: cleanFirebaseConfigValue(raw.measurementId),
    firestoreDatabaseId: normalizeDatabaseId(raw.firestoreDatabaseId),
  };
  return sanitized;
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
  return {
    configured: false,
    source: 'none',
    config: {},
    warnings: [
      `Incomplete Firebase Web SDK configuration. Missing environment variables: ${missingEnvVars.join(', ')}.`,
    ],
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
export function formatFirestoreUiError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'Unable to sync with Firestore right now.';

  let underlying = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string };
    if (parsed && typeof parsed.error === 'string') {
      underlying = parsed.error;
    }
  } catch {
    // Plain error message
  }

  const lower = underlying.toLowerCase();
  if (
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied')
  ) {
    return 'Firestore access denied by security rules. Confirm you are signed in with a verified Google account, opted in to the live community, and using a valid anonymous handle.';
  }
  if (lower.includes('quota exceeded')) {
    return 'Firestore free-tier daily quota was exceeded. Quota resets tomorrow; Demo Community Preview remains available.';
  }
  if (lower.includes('client is offline') || lower.includes('unavailable')) {
    return 'Firestore is temporarily unreachable. Check your connection and retry.';
  }
  return scrubSensitiveTokens(underlying);
}
