import {
  deleteApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import { getAuth as firebaseGetAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, type Functions } from 'firebase/functions';

// Per-env config reading moved out of this file in the RN portability
// refactor: the shared package no longer reads env vars. The host app calls
// `initFirebase(config)` at startup with config it sourced itself (web reads
// `process.env.NEXT_PUBLIC_APP_ENV` via `@cultuvilla/shared/config/environments`;
// RN reads `Constants.expoConfig.extra`).

export interface InitFirebaseOptions {
  region?: string;
}

interface InitializedState {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

const DEFAULT_FUNCTIONS_REGION = 'us-central1';
const NOT_INITIALIZED_MESSAGE =
  'Firebase is not initialized. Call initFirebase(config) from your app entrypoint before importing any service.';

let state: InitializedState | null = null;

export function initFirebase(
  config: FirebaseOptions,
  options: InitFirebaseOptions = {},
): FirebaseApp {
  if (state) return state.app;

  const app = getApps()[0] ?? initializeApp(config);
  const auth = firebaseGetAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  const functions = getFunctions(app, options.region ?? DEFAULT_FUNCTIONS_REGION);

  state = { app, auth, db, storage, functions };
  return app;
}

function requireState(): InitializedState {
  if (!state) throw new Error(NOT_INITIALIZED_MESSAGE);
  return state;
}

export function getFirebaseApp(): FirebaseApp {
  return requireState().app;
}

export function getDb(): Firestore {
  return requireState().db;
}

export function getAuth(): Auth {
  return requireState().auth;
}

export function getFirebaseStorage(): FirebaseStorage {
  return requireState().storage;
}

export function getFirebaseFunctions(): Functions {
  return requireState().functions;
}

export async function _resetFirebaseForTests(): Promise<void> {
  if (!state) return;
  try {
    await deleteApp(state.app);
  } catch {
    // ignore — the app may already have been torn down
  }
  state = null;
}
