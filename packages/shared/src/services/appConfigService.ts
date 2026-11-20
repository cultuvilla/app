import { getDb } from '../firebase';
import { appVersionConfigDoc } from '../firebase/refs/client';
import type { AppVersionConfig } from '../models/config';
import { watchDoc, type Unwatch, type WatchError } from './watch';

/**
 * Live min/latest version config: `null` when the doc is missing, `onError` on
 * a failed read or a malformed doc.
 *
 * A listener, not a one-shot read, because the force-update gate must not
 * depend on a single read succeeding at launch: 1.5.0 did a `getDoc` there, its
 * JS SDK timed out connecting, and the wall was down for the whole session. A
 * listener answers from the device cache, keeps retrying the server, and raises
 * a wall published while the app is open.
 */
export function watchAppVersionConfig(
  onNext: (config: AppVersionConfig | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(appVersionConfigDoc(getDb()), onNext, onError);
}
