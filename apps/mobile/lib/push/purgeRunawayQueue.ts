import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalCacheAndRestart } from '../auth/clearLocalCache';

const KEY = 'push.runawayQueuePurged.v1';

/**
 * Device registration used to re-trigger itself and queue Firestore writes
 * without end. Firestore drains its queue in order and persists it, so a phone
 * that ran that build holds a backlog every later write waits behind, comments
 * included, even once the loop is gone. The only way to drop it is to wipe the
 * on-device cache, once. Anything else still queued is lost, which beats waiting
 * behind hours of writes that only drain while the app is open.
 *
 * The flag is set first: a wipe that fails must not restart the app every launch.
 * A signed-out launch has nothing queued, and marking it done spares a fresh
 * install from a wipe in the middle of signing up.
 */
export async function purgeRunawayQueueOnce(signedIn: boolean): Promise<void> {
  if ((await AsyncStorage.getItem(KEY)) !== null) return;
  await AsyncStorage.setItem(KEY, '1');
  if (signedIn) await clearLocalCacheAndRestart();
}
