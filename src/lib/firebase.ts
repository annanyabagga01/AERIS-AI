import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
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
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  containsSensitivePiiOrLocation,
  resolveContributionCo2,
  sanitizeAnonymousHandle,
  sanitizeCityName,
} from './community.ts';
import type {
  ActionType,
  ChallengeParticipantRecord,
  CommunityChallenge,
  CommunityContribution,
} from './types.ts';

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig &&
      typeof firebaseConfig.projectId === 'string' &&
      firebaseConfig.projectId.length > 0 &&
      firebaseConfig.projectId !== 'remixed-project-id' &&
      typeof firebaseConfig.apiKey === 'string' &&
      firebaseConfig.apiKey.length > 0
  );
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

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
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
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
  if (!isFirebaseConfigured()) return;
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
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 128);
  return cleaned || `entry_${Date.now()}`;
}

export function subscribeLiveContributions(
  onData: (items: CommunityContribution[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
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
  const uid = auth.currentUser?.uid;
  if (!uid) {
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
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      'Please sign in with Google before submitting to the live community feed.'
    );
  }

  const piiError = containsSensitivePiiOrLocation(
    `${input.anonymousHandle} ${input.note ?? ''}`
  );
  if (piiError) {
    throw new Error(piiError);
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
  const user = auth.currentUser;
  if (!user) {
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
  const user = auth.currentUser;
  if (!user) {
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
  const user = auth.currentUser;
  if (!user) {
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
  const user = auth.currentUser;
  if (!user) {
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
