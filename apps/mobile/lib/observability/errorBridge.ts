import { httpsCallable } from '@cultuvilla/shared/firebase/sdk/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseFunctions } from '@cultuvilla/shared/firebase';

export type ClientErrorPayload = {
  message?: string;
  name?: string;
  code?: string;
  stack?: string;
  route?: string;
  appVersion?: string;
  platform?: string;
  operation?: string;
  operation_id?: string;
  surface?: string;
};

const memHashCache = new Map<string, string>();

/** Test-only: clear the in-memory hash cache between cases. */
export function __resetHashCacheForTest(): void {
  memHashCache.clear();
}

export async function sendClientError(payload: ClientErrorPayload): Promise<void> {
  try {
    const fn = httpsCallable(getFirebaseFunctions(), 'logClientError');
    await fn(payload);
  } catch {
    // Fire-and-forget: observability must never break a user flow.
  }
}

export async function fetchUserIdHash(uid: string): Promise<string | null> {
  const key = `obs.userIdHash.${uid}`;
  const mem = memHashCache.get(uid);
  if (mem) return mem;
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      memHashCache.set(uid, stored);
      return stored;
    }
    const fn = httpsCallable<unknown, { hash: string }>(getFirebaseFunctions(), 'getUserIdHash');
    const { data } = await fn();
    if (data?.hash) {
      memHashCache.set(uid, data.hash);
      await AsyncStorage.setItem(key, data.hash);
      return data.hash;
    }
    return null;
  } catch {
    return null;
  }
}
