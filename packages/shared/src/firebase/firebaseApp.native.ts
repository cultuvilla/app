// Native twin of ./firebaseApp.ts (see ./sdk/README.md). The native SDKs read
// their project config from the bundled google-services.json /
// GoogleService-Info.plist, so the default app already exists; `config` is
// accepted only to keep one call site for both SDKs.
import { getApp, type ReactNativeFirebase } from '@react-native-firebase/app';
import { getAuth as getNativeAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { getStorage } from '@react-native-firebase/storage';

export interface InitFirebaseOptions {
  region?: string;
}

interface InitializedState {
  app: ReactNativeFirebase.FirebaseApp;
  auth: ReturnType<typeof getNativeAuth>;
  db: ReturnType<typeof getFirestore>;
  storage: ReturnType<typeof getStorage>;
  functions: ReturnType<typeof getFunctions>;
}

const DEFAULT_FUNCTIONS_REGION = 'us-central1';
const NOT_INITIALIZED_MESSAGE =
  'Firebase is not initialized. Call initFirebase(config) from your app entrypoint before importing any service.';

let state: InitializedState | null = null;

export function initFirebase(_config: unknown, options: InitFirebaseOptions = {}): ReactNativeFirebase.FirebaseApp {
  if (state) return state.app;
  const app = getApp();
  // No settings call: the native SDKs keep Firestore's persistent on-device
  // cache on by default — the reason the app runs on them
  // (docs/plans/ongoing/offline-first-village.md) — and a settings call ahead of
  // the emulator wiring is an ordering hazard in the E2E build.
  state = {
    app,
    auth: getNativeAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
    functions: getFunctions(app, options.region ?? DEFAULT_FUNCTIONS_REGION),
  };
  return app;
}

function requireState(): InitializedState {
  if (!state) throw new Error(NOT_INITIALIZED_MESSAGE);
  return state;
}

export const getFirebaseApp = () => requireState().app;
export const getDb = () => requireState().db;
export const getAuth = () => requireState().auth;
export const getFirebaseStorage = () => requireState().storage;
export const getFirebaseFunctions = () => requireState().functions;

export function _resetFirebaseForTests(): Promise<void> {
  state = null;
  return Promise.resolve();
}
