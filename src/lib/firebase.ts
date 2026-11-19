import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
} from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
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

export function isFirebaseConfigured(): boolean {
  return resolvedFirebase.configured;
}

export function getFirebasePublicStatus(): FirebasePublicStatus {
  return {
    configured: resolvedFirebase.configured,
    source: resolvedFirebase.source,
    projectId: firebaseConfig.projectId || null,
    authDomain: firebaseConfig.authDomain || null,
    hasNamedDatabase: Boolean(firebaseConfig.firestoreDatabaseId),
    warnings: [...resolvedFirebase.warnings],
  };
}

const app: FirebaseApp | null = resolvedFirebase.configured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;
export const db: Firestore | null = app
  ? firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app)
  : null;
export const auth: Auth | null = app ? getAuth(app) : null;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) {
    throw new Error(
      'Firebase Authentication is not configured. Provide local firebase-applet-config.json or complete VITE_FIREBASE_* environment variables.'
    );
  }
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (error) {
    const currentHost =
      typeof window !== 'undefined' ? window.location.hostname : null;
    throw new Error(
      formatFirebaseAuthError(error, {
        projectId: firebaseConfig.projectId || null,
        authDomain: firebaseConfig.authDomain || null,
        currentHost,
      })
    );
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
  if (!db || !auth) {
    onData([]);
    return () => {};
  }
  const path = 'community_contributions';
  const currentUid = auth.currentUser?.uid;
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
  if (!db) {
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
