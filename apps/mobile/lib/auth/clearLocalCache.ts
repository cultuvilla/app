import { DevSettings } from 'react-native';
import * as Updates from 'expo-updates';
import { getDb } from '@cultuvilla/shared/firebase';
import { observability } from '@cultuvilla/shared';
import { clearIndexedDbPersistence, terminate } from '@cultuvilla/shared/firebase/sdk/firestore';
import { skipIntroOnNextLaunch } from '../intro/introSkip';

declare const __DEV__: boolean;

const CLEAR_TIMEOUT_MS = 5000;

function within(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Wipes Firestore's on-device cache, then restarts the JS app. Called on
 * sign-out.
 *
 * The cache holds member-only data (private events, censo answers) and a read
 * served from it is never checked against the security rules, so it must not
 * outlive the session on a shared phone. Clearing only works on a Firestore
 * that is not running, hence `terminate` first — which also kills every
 * mounted listener and drops the native emulator wiring. Restarting re-runs
 * the bootstrap, so the next session starts from a clean, correctly wired SDK.
 */
export async function clearLocalCacheAndRestart(): Promise<void> {
  try {
    const db = getDb();
    await within(
      (async () => {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      })(),
      CLEAR_TIMEOUT_MS,
    );
  } catch (error) {
    observability.captureError(error, { handler: 'clearLocalCacheAndRestart' });
  }
  await skipIntroOnNextLaunch().catch((error: unknown) => {
    observability.captureError(error, { handler: 'clearLocalCacheAndRestart' });
  });
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  await Updates.reloadAsync();
}
