import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
} from 'firebase/app';
import {
  formatFirestoreUiError,
  resolveFirebaseClientConfig,
  type FirebaseClientConfig,
  type FirebasePublicStatus,
} from './firebaseConfig.ts';

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

let appInstance: FirebaseApp | null = null;
let firebaseInitError: string | null = null;

if (resolvedFirebase.configured) {
  try {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    firebaseInitError = `Firebase initializeApp() failed: ${message}`;
  }
}

export const app: FirebaseApp | null = appInstance;
export { firebaseInitError };

export function isFirebaseConfigured(): boolean {
  return Boolean(resolvedFirebase.configured && app && !firebaseInitError);
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
