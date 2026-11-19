import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
} from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  containsSensitivePiiOrLocation,
  resolveContributionCo2,
  sanitizeAnonymousHandle,
  sanitizeCityName,
} from './community.ts';
import {
  formatFirebaseAuthError,
  formatFirestoreUiError,
  resolveFirebaseClientConfig,
  type FirebaseClientConfig,
  type FirebasePublicStatus,
} from './firebaseConfig.ts';
import type {
  ActionType,
  ChallengeParticipantRecord,
  CommunityChallenge,
  CommunityContribution,
} from './types.ts';

export { formatFirestoreUiError };

const localAppletConfigs = import.meta.glob<
  { default?: FirebaseClientConfig } & FirebaseClientConfig
>('../../firebase-applet-config.json', { eager: true });

const localAppletConfigRaw = Object.values(localAppletConfigs)[0];
const localAppletConfig: FirebaseClientConfig =
  localAppletConfigRaw?.default ?? localAppletConfigRaw ?? {};

const envFirebaseConfig: FirebaseClientConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID,
};

const resolvedFirebase = resolveFirebaseClientConfig({
  appletConfig: localAppletConfig,
  envConfig: envFirebaseConfig,
});

const firebaseConfig: FirebaseClientConfig = resolvedFirebase.config;

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;
let firebaseInitError: string | null = null;

if (resolvedFirebase.configured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    firebaseInitError = `Firebase initializeApp() failed: ${message}`;
    console.error('[AERIS Firebase Init Error] initializeApp() failed:', err);
  }

  if (app) {
    try {
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
        : getFirestore(app);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      firebaseInitError =
        firebaseInitError ?? `Firebase getFirestore() failed: ${message}`;
      console.error('[AERIS Firebase Init Error] getFirestore() failed:', err);
    }

    try {
      authInstance = getAuth(app);
      authInstance.useDeviceLanguage();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      firebaseInitError =
        firebaseInitError ?? `Firebase getAuth() failed: ${message}`;
      console.error('[AERIS Firebase Init Error] getAuth() failed:', err);
    }
  }
}

try {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  googleProviderInstance = provider;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  firebaseInitError =
    firebaseInitError ?? `GoogleAuthProvider initialization failed: ${message}`;
  console.error(
    '[AERIS Firebase Init Error] GoogleAuthProvider initialization failed:',
    err
  );
}

export const db: Firestore | null = dbInstance;
export const auth: Auth | null = authInstance;
export const googleProvider: GoogleAuthProvider | null = googleProviderInstance;
export { firebaseInitError };

export function isFirebaseConfigured(): boolean {
  return Boolean(
    resolvedFirebase.configured &&
      app &&
      auth &&
      googleProvider &&
      !firebaseInitError
  );
}

export function getExpectedOAuthRedirectUri(): string | null {
  return firebaseConfig.authDomain
    ? `https://${firebaseConfig.authDomain}/__/auth/handler`
    : null;
}

export function getFirebasePublicStatus(): FirebasePublicStatus {
  return {
    configured: isFirebaseConfigured(),
    source: resolvedFirebase.source,
    projectId: firebaseConfig.projectId || null,
    authDomain: firebaseConfig.authDomain || null,
    databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    hasNamedDatabase: Boolean(firebaseConfig.firestoreDatabaseId),
    warnings: [...resolvedFirebase.warnings],
    missingEnvVars: [...resolvedFirebase.missingEnvVars],
    initError: firebaseInitError,
  };
}

// Startup diagnostic console logging for Firebase auth object check and initialization errors
// (never logs API keys or user credentials).
if (typeof console !== 'undefined') {
  const authCheckSummary = {
    configured: resolvedFirebase.configured,
    source: resolvedFirebase.source,
    projectId: firebaseConfig.projectId || null,
    authDomain: firebaseConfig.authDomain || null,
    databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    expectedOAuthRedirectUri: getExpectedOAuthRedirectUri(),
    currentOrigin: typeof window !== 'undefined' ? window.location.origin : null,
    appInitialized: Boolean(app),
    authInitialized: Boolean(auth),
    authAppName: auth?.app?.name ?? null,
    authConfigDomain: auth?.config?.authDomain ?? null,
    googleProviderInitialized: Boolean(googleProvider),
    googleProviderId: googleProvider?.providerId ?? null,
    missingEnvVars: resolvedFirebase.missingEnvVars,
    initError: firebaseInitError,
  };

  if (firebaseInitError) {
    console.error(
      '[AERIS Firebase] Startup initialization failed:',
      authCheckSummary
    );
  } else if (!auth) {
    console.warn(
      '[AERIS Firebase] Startup auth object check: auth is null (Firebase not configured):',
      authCheckSummary
    );
  } else {
    console.info(
      '[AERIS Firebase] Startup auth object check passed:',
      authCheckSummary
    );
  }

  if (resolvedFirebase.warnings.length > 0) {
    console.warn(
      '[AERIS Firebase] Startup configuration warnings:',
      resolvedFirebase.warnings
    );
  }
}

let persistenceReadyPromise: Promise<void> | null = null;
function ensureAuthPersistence(): Promise<void> {
  if (!auth) return Promise.resolve();
  if (!persistenceReadyPromise) {
    persistenceReadyPromise = setPersistence(auth, browserLocalPersistence).catch(
      (err) => {
        console.warn(
          '[AERIS Firebase] setPersistence(browserLocalPersistence) fell back to default:',
          err instanceof Error ? err.message : String(err)
        );
      }
    );
  }
  return persistenceReadyPromise;
}

function isTopLevelBrowserWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue =
  (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate Firestore connection on boot
async function testConnection() {
  if (!isFirebaseConfigured() || !db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function subscribeAuth(cb: (user: User | null) => void): Unsubscribe {
  if (!auth) {
    cb(null);
    return () => {};
  }
  void ensureAuthPersistence();
  return onAuthStateChanged(
    auth,
    (user) => {
      cb(user);
    },
    (error) => {
      console.error(
        '[AERIS Firebase] onAuthStateChanged() listener error:',
        error instanceof Error ? error.message : String(error)
      );
      cb(null);
    }
  );
}

/**
 * Completes any pending Google OAuth redirect sign-in (used only when a
 * top-level browser blocks popups and falls back to signInWithRedirect).
 */
export async function completeGoogleRedirectSignIn(): Promise<{
  user: User | null;
  error: string | null;
}> {
  if (!auth) {
    return { user: null, error: null };
  }
  try {
    await ensureAuthPersistence();
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.info('[AERIS Firebase] getRedirectResult() succeeded:', {
        uidPresent: Boolean(result.user.uid),
        emailVerified: Boolean(result.user.emailVerified),
        providerId: result.providerId ?? googleProvider?.providerId ?? 'google.com',
      });
    }
    return { user: result?.user ?? null, error: null };
  } catch (error) {
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    console.error('[AERIS Firebase] getRedirectResult() failed during startup:', {
      code: errorCode || 'unknown',
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      projectId: firebaseConfig.projectId || null,
      authDomain: firebaseConfig.authDomain || null,
      expectedRedirectUri: getExpectedOAuthRedirectUri(),
      currentHost:
        typeof window !== 'undefined' ? window.location.hostname : null,
    });
    const currentHost =
      typeof window !== 'undefined' ? window.location.hostname : null;
    return {
      user: null,
      error: formatFirebaseAuthError(error, {
        projectId: firebaseConfig.projectId || null,
        authDomain: firebaseConfig.authDomain || null,
        currentHost,
      }),
    };
  }
}

export async function signInWithGoogle(): Promise<{
  user: User | null;
  redirected: boolean;
}> {
  if (!auth || !googleProvider) {
    if (firebaseInitError) {
      console.error(
        '[AERIS Firebase] Cannot start Google Sign-In due to startup initialization error:',
        firebaseInitError
      );
      throw new Error(
        `Firebase Authentication failed to initialize at startup: ${firebaseInitError}`
      );
    }
    const missing = resolvedFirebase.missingEnvVars;
    const missingHint =
      missing.length > 0
        ? ` Missing environment variables: ${missing.join(', ')}.`
        : '';
    console.warn(
      '[AERIS Firebase] signInWithGoogle() aborted: auth instance is null.',
      { missingEnvVars: missing }
    );
    throw new Error(
      `Firebase Authentication is not configured in this deployment.${missingHint} Configure VITE_FIREBASE_* variables in Vercel and redeploy.`
    );
  }
  await ensureAuthPersistence();
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    console.info('[AERIS Firebase] signInWithPopup() succeeded:', {
      uidPresent: Boolean(cred.user?.uid),
      emailVerified: Boolean(cred.user?.emailVerified),
      providerId: cred.providerId ?? googleProvider.providerId,
    });
    return { user: cred.user, redirected: false };
  } catch (error) {
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    const currentHost =
      typeof window !== 'undefined' ? window.location.hostname : null;
    const topLevelWindow = isTopLevelBrowserWindow();

    const isHandledAuthFlowWarning =
      errorCode === 'auth/unauthorized-domain' ||
      errorCode === 'auth/popup-closed-by-user' ||
      errorCode === 'auth/cancelled-popup-request' ||
      errorCode === 'auth/popup-blocked';

    const logDetails = {
      code: errorCode || 'unknown',
      name: error instanceof Error ? error.name : typeof error,
      message: formatFirebaseAuthError(error, {
        projectId: firebaseConfig.projectId || null,
        authDomain: firebaseConfig.authDomain || null,
        currentHost,
      }),
      projectId: firebaseConfig.projectId || null,
      authDomain: firebaseConfig.authDomain || null,
      expectedRedirectUri: getExpectedOAuthRedirectUri(),
      currentHost,
      isTopLevelWindow: topLevelWindow,
    };

    if (isHandledAuthFlowWarning) {
      console.warn('[AERIS Firebase] signInWithPopup() notice:', logDetails);
    } else {
      console.error('[AERIS Firebase] signInWithPopup() failed:', logDetails);
    }

    // Fall back to redirect only on top-level windows (e.g. mobile browsers on Vercel)
    // when popups are blocked; keep popup-only inside iframes.
    if (
      (errorCode === 'auth/popup-blocked' ||
        errorCode === 'auth/operation-not-supported-in-this-environment') &&
      topLevelWindow
    ) {
      console.info(
        '[AERIS Firebase] Falling back to signInWithRedirect() on top-level window.',
        { expectedRedirectUri: getExpectedOAuthRedirectUri(), currentHost }
      );
      try {
        await signInWithRedirect(auth, googleProvider);
        return { user: null, redirected: true };
      } catch (redirectError) {
        const redirectCode =
          redirectError &&
          typeof redirectError === 'object' &&
          'code' in redirectError
            ? String((redirectError as { code?: unknown }).code ?? '')
            : '';
        console.error('[AERIS Firebase] signInWithRedirect() fallback failed:', {
          code: redirectCode || 'unknown',
          name:
            redirectError instanceof Error
              ? redirectError.name
              : typeof redirectError,
          projectId: firebaseConfig.projectId || null,
          authDomain: firebaseConfig.authDomain || null,
          expectedRedirectUri: getExpectedOAuthRedirectUri(),
          currentHost,
        });
        throw new Error(
          formatFirebaseAuthError(redirectError, {
            projectId: firebaseConfig.projectId || null,
            authDomain: firebaseConfig.authDomain || null,
            currentHost,
          })
        );
      }
    }

    throw new Error(logDetails.message);
  }
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    throw new Error(
      formatFirebaseAuthError(error, {
        projectId: firebaseConfig.projectId || null,
        authDomain: firebaseConfig.authDomain || null,
      })
    );
  }
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 128);
  return cleaned || `entry_${Date.now()}`;
}

export function subscribeLiveContributions(
  onData: (items: CommunityContribution[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const currentUid = auth?.currentUser?.uid;
  if (!db || !currentUid) {
    onData([]);
    return () => {};
  }
  const path = 'community_contributions';
  const q = query(
    collection(db, path),
    where('optInPublic', '==', true),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: CommunityContribution[] = snap.docs
        .map((d) => {
          const data = d.data();
          const ts =
            data.createdAt && typeof data.createdAt.toDate === 'function'
              ? data.createdAt.toDate().toISOString()
              : new Date().toISOString();
          const co2Val = Number(data.co2AvoidedKg ?? 0);
          return {
            id: d.id,
            anonymousHandle: String(data.anonymousHandle ?? 'Resident'),
            city: sanitizeCityName(String(data.city ?? 'India')),
            actionType: data.actionType as ActionType,
            co2AvoidedKg: co2Val,
            isQualitative: co2Val <= 0,
            isMine: Boolean(currentUid && data.authorUid === currentUid),
            note: typeof data.note === 'string' ? data.note : undefined,
            challengeId:
              typeof data.challengeId === 'string' ? data.challengeId : undefined,
            createdAtIso: ts,
            isDemo: false,
          };
        })
        .sort((a, b) => Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso))
        .slice(0, 80);
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeLiveChallenges(
  onData: (challenges: CommunityChallenge[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const currentUid = auth?.currentUser?.uid;
  if (!db || !currentUid) {
    onData([]);
    return () => {};
  }
  const path = 'community_challenges';
  const q = query(
    collection(db, path),
    where('isActive', '==', true),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: CommunityChallenge[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title ?? 'Community Challenge'),
          description: String(data.description ?? ''),
          cityScope: String(data.cityScope ?? 'India'),
          targetActions: Number(data.targetActions ?? 100),
          isDemo: false,
        };
      });
      onData(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeChallengeParticipants(
  onData: (records: ChallengeParticipantRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'challenge_participants';
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, path),
    where('optInPublic', '==', true),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      const records: ChallengeParticipantRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          challengeId: String(data.challengeId ?? ''),
          city: sanitizeCityName(String(data.city ?? 'India')),
          isMine: data.userId === uid,
          isDemo: false,
        };
      });
      onData(records);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function submitOptInContribution(input: {
  anonymousHandle: string;
  city: string;
  actionType: ActionType;
  co2AvoidedKg: number;
  note?: string;
  challengeId?: string;
}): Promise<void> {
  const user = auth?.currentUser;
  if (!db || !user) {
    throw new Error(
      'Please sign in with Google before submitting to the live community feed.'
    );
  }

  const combinedText = `${input.anonymousHandle} ${input.note ?? ''}`;
  const piiError = containsSensitivePiiOrLocation(combinedText);
  if (piiError) {
    throw new Error(piiError);
  }

  const lowerCombined = combinedText.toLowerCase();
  const userEmail = user.email?.trim().toLowerCase();
  const userDisplayName = user.displayName?.trim().toLowerCase();
  if (userEmail && lowerCombined.includes(userEmail)) {
    throw new Error(
      'Please do not include your Google email address in your anonymous handle or public note.'
    );
  }
  if (
    userDisplayName &&
    userDisplayName.length >= 4 &&
    lowerCombined.includes(userDisplayName)
  ) {
    throw new Error(
      'Please use an anonymous handle rather than your Google account name in public community activity.'
    );
  }

  const { co2AvoidedKg } = resolveContributionCo2(
    input.actionType,
    input.co2AvoidedKg
  );

  const docId = sanitizeId(`c_${Date.now()}_${user.uid.slice(0, 8)}`);
  const docPath = `community_contributions/${docId}`;

  const payload: Record<string, unknown> = {
    authorUid: user.uid,
    anonymousHandle: sanitizeAnonymousHandle(input.anonymousHandle),
    city: sanitizeCityName(input.city),
    actionType: input.actionType,
    co2AvoidedKg,
    optInPublic: true,
    createdAt: serverTimestamp(),
  };

  const trimmedNote = input.note?.trim().slice(0, 240);
  if (trimmedNote) {
    payload.note = trimmedNote;
  }
  const trimmedChallenge = input.challengeId
    ?.trim()
    .replace(/[^a-zA-Z0-9_\-]+/g, '')
    .slice(0, 64);
  if (trimmedChallenge) {
    payload.challengeId = trimmedChallenge;
  }

  try {
    await setDoc(doc(db, 'community_contributions', docId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath);
  }
}

export async function deleteOptInContribution(
  contributionId: string
): Promise<void> {
  const user = auth?.currentUser;
  if (!db || !user) {
    throw new Error('Sign in required to delete your contribution.');
  }
  const cleanId = sanitizeId(contributionId);
  const docPath = `community_contributions/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'community_contributions', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

export async function joinCommunityChallenge(
  challengeId: string,
  city: string
): Promise<void> {
  const user = auth?.currentUser;
  if (!db || !user) {
    throw new Error('Please sign in with Google to join community challenges.');
  }
  const cleanChallenge = challengeId.replace(/[^a-zA-Z0-9_\-]+/g, '').slice(0, 64);
  const participantId = sanitizeId(`${cleanChallenge}_${user.uid}`);
  const docPath = `challenge_participants/${participantId}`;

  try {
    await setDoc(doc(db, 'challenge_participants', participantId), {
      challengeId: cleanChallenge,
      userId: user.uid,
      city: sanitizeCityName(city),
      optInPublic: true,
      joinedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath);
  }
}

export async function leaveCommunityChallenge(
  challengeId: string
): Promise<void> {
  const user = auth?.currentUser;
  if (!db || !user) {
    throw new Error('Please sign in with Google to manage challenge enrollment.');
  }
  const cleanChallenge = challengeId.replace(/[^a-zA-Z0-9_\-]+/g, '').slice(0, 64);
  const participantId = sanitizeId(`${cleanChallenge}_${user.uid}`);
  const docPath = `challenge_participants/${participantId}`;

  try {
    await deleteDoc(doc(db, 'challenge_participants', participantId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

export async function seedChallengesToFirestore(
  challenges: CommunityChallenge[]
): Promise<void> {
  const user = auth?.currentUser;
  if (!db || !user) {
    throw new Error('Admin sign-in required to seed Firestore challenges.');
  }
  for (const ch of challenges) {
    const cleanId = ch.id.replace(/[^a-zA-Z0-9_\-]+/g, '').slice(0, 64);
    const docPath = `community_challenges/${cleanId}`;
    try {
      await setDoc(doc(db, 'community_challenges', cleanId), {
        title: ch.title.slice(0, 100),
        description: ch.description.slice(0, 360),
        cityScope: ch.cityScope.slice(0, 60),
        targetActions: Math.max(1, Math.min(1000000, ch.targetActions)),
        isActive: true,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, docPath);
    }
  }
}
