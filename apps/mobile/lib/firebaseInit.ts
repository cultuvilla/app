import type { FirebaseOptions } from 'firebase/app';
import Constants from 'expo-constants';
import { connectAuthEmulator } from '@cultuvilla/shared/firebase/sdk/auth';
import { connectFirestoreEmulator } from '@cultuvilla/shared/firebase/sdk/firestore';
import { connectFunctionsEmulator } from '@cultuvilla/shared/firebase/sdk/functions';
import { connectStorageEmulator } from '@cultuvilla/shared/firebase/sdk/storage';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';
import {
  initFirebase,
  getAuth,
  getDb,
  getFirebaseFunctions,
  getFirebaseStorage,
} from '@cultuvilla/shared/firebase';
import { initMobileAppCheck } from './appCheck';

declare const __DEV__: boolean;

let unhandledHookInstalled = false;
function installUnhandledFirestoreDenyHook(): void {
  if (!__DEV__ || unhandledHookInstalled) return;
  unhandledHookInstalled = true;
  const target: { addEventListener?: typeof globalThis.addEventListener } =
    globalThis as never;
  if (typeof target.addEventListener !== 'function') return;
  target.addEventListener('unhandledrejection', (event: { reason?: unknown }) => {
    const reason = (event as { reason?: unknown }).reason;
    if (firebaseErrorCode(reason) === 'permission-denied') {
      const stack = reason instanceof Error ? reason.stack : undefined;
      console.warn(`[firestore-deny:unhandled] stack=${stack ?? '<no stack>'}`);
    }
  });
}

/**
 * The per-environment FirebaseOptions app.config.ts wrote into
 * `extra.firebaseConfig`. The native SDK reads the bundled
 * google-services.json / GoogleService-Info.plist instead; this is passed so
 * `initFirebase` keeps one signature across SDKs.
 */
function getFirebaseOptions(): FirebaseOptions {
  const cfg = Constants.expoConfig?.extra?.firebaseConfig as FirebaseOptions | undefined;
  if (!cfg) {
    throw new Error(
      '[cultuvilla] firebaseConfig missing from expoConfig.extra. ' +
        'Add a .env file with FIREBASE_* vars and restart the bundler.',
    );
  }
  return cfg;
}

/**
 * E2E only — point the client SDK at the local Firebase emulators.
 *
 * Gated by the build-time `USE_FIREBASE_EMULATOR` flag (surfaced as
 * `extra.useEmulator`), which is set ONLY in the android-e2e CI job and never in a
 * deploy workflow. This is one half of the fail-closed fixture-login design:
 * the SAME flag also enables the test-login seam in AuthContext, so a fixture
 * session can only be minted while the app talks to `127.0.0.1` emulators. A
 * deployed build (real Firebase, no local emulator) cannot complete the flow
 * even if the flag leaked — it fails closed. The `check:no-test-login-leak`
 * grep gate keeps these symbols confined to their allowlisted files.
 */
let emulatorsConnected = false;
function connectEmulatorsIfEnabled(): void {
  if (emulatorsConnected) return;
  if (Constants.expoConfig?.extra?.useEmulator !== true) return;
  emulatorsConnected = true;
  // An Android AVD reaches the host's emulators through `10.0.2.2`, not loopback
  // (`127.0.0.1` is the device itself); EXPO_PUBLIC_EMULATOR_HOST is baked in at
  // build time by the E2E build. Loopback stays the default, which keeps the
  // fail-closed guarantee: no deployed build has an emulator to reach.
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? '127.0.0.1';
  connectAuthEmulator(getAuth(), `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(getDb(), host, 8080);
  connectFunctionsEmulator(getFirebaseFunctions(), host, 5001);
  connectStorageEmulator(getFirebaseStorage(), host, 9199);
}

/**
 * Initialise the native Firebase SDKs. Auth persists natively and Firestore
 * keeps its on-device cache (see `initFirebase`).
 *
 * Idempotent — `initFirebase` returns early if already initialised.
 */
export function bootstrapFirebase(): void {
  initFirebase(getFirebaseOptions());
  // Must run before any service issues a read/write; connect*Emulator throws
  // once the SDK has been used against production hosts.
  connectEmulatorsIfEnabled();
  initMobileAppCheck();
  installUnhandledFirestoreDenyHook();
}
