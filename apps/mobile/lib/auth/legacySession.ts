import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from '@cultuvilla/shared/firebase';
import { signInWithCustomToken } from '@cultuvilla/shared/firebase/sdk/auth';
import { restoreLegacySession as requestRestore } from '@cultuvilla/shared/services/authSessionService';

// Where the JS SDK, which the app ran on up to v1.5, kept the session:
// `firebase:authUser:<apiKey>:<appName>`. The native SDK never reads or clears it,
// so it stays on the phone after the update, refresh token included.
const LEGACY_KEY_PREFIX = 'firebase:authUser:';

async function legacyKeys(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return keys.filter((key) => key.startsWith(LEGACY_KEY_PREFIX));
}

function readRefreshToken(stored: string | null): string | null {
  try {
    const parsed = JSON.parse(stored ?? 'null') as {
      stsTokenManager?: { refreshToken?: unknown };
    } | null;
    const token = parsed?.stsTokenManager?.refreshToken;
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

export async function discardLegacySession(): Promise<void> {
  const keys = await legacyKeys();
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

/**
 * Signs in with the session a pre-native version left on this phone, if any, so
 * updating the app does not log anyone out. Called only when the native SDK has
 * no user.
 *
 * The entry is deleted once answered, restored or refused. A failed request or
 * sign-in keeps it for the next launch: a phone offline at its first launch after
 * updating should not lose the session for good.
 */
export async function restoreLegacySession(): Promise<void> {
  const keys = await legacyKeys();
  const key = keys[0];
  if (!key) return;

  const refreshToken = readRefreshToken(await AsyncStorage.getItem(key));
  const apiKey = key.slice(LEGACY_KEY_PREFIX.length).split(':')[0];
  if (!refreshToken || !apiKey) {
    await AsyncStorage.multiRemove(keys);
    return;
  }

  const result = await requestRestore(refreshToken, apiKey);
  // Someone who signed in by hand while this was in flight keeps that session.
  if (result.status === 'restored' && !getAuth().currentUser) {
    await signInWithCustomToken(getAuth(), result.token);
  }
  await AsyncStorage.multiRemove(keys);
}
