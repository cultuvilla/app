import { getApp } from '@react-native-firebase/app';
import {
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

import { getAppEnv, type AppEnv } from './env';

type AndroidProvider = 'debug' | 'playIntegrity';
type AppleProvider = 'debug' | 'appAttestWithDeviceCheckFallback';

export interface AppCheckProviders {
  android: AndroidProvider;
  apple: AppleProvider;
}

/**
 * Dev builds (the dev client, the sideloaded preview-dev APK, and the E2E
 * builds that talk to local emulators) are never installed from a store, so
 * Play Integrity and App Attest cannot vouch for them: they use the debug
 * provider, which needs no console setup. Each install logs its own debug
 * token (logcat `DebugAppCheckProvider` / Xcode console); register it under
 * App Check → Manage debug tokens in `villa-events` to get verified tokens.
 */
export function appCheckProvidersFor(env: AppEnv): AppCheckProviders {
  if (env === 'dev') return { android: 'debug', apple: 'debug' };
  return { android: 'playIntegrity', apple: 'appAttestWithDeviceCheckFallback' };
}

let initialized = false;

/**
 * Activates App Check on the native default app. Enforcement is a console
 * switch, not code: until it is on, a failed attestation only shows up as
 * "unverified" in the metrics. The native SDKs never fail a Firestore,
 * Storage or Functions call on a token error — a failed exchange resolves to a
 * placeholder token — and nothing here awaits a token, so boot never waits on
 * attestation. Any synchronous failure (no default app, a native module
 * missing from an older binary running a newer bundle) is swallowed: App
 * Check must never take the app down.
 */
export function initMobileAppCheck(): void {
  if (initialized) return;
  initialized = true;
  try {
    const providers = appCheckProvidersFor(getAppEnv());
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: { provider: providers.android },
      apple: { provider: providers.apple },
    });
    initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  } catch (error) {
    console.warn('[app-check] not activated', error);
  }
}
