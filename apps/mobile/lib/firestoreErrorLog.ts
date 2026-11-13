import { observability } from '@cultuvilla/shared';
import { getAuth } from '@cultuvilla/shared/firebase';
import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';

declare const __DEV__: boolean;

/**
 * Wraps a Firestore (or any) async op so a permission-denied error is reported
 * with the call site that produced it.
 *
 * Firestore's permission-denied deliberately carries no collection or document
 * path — telling the client which rule failed would itself leak the rule. Every
 * one of these errors is therefore identical by construction, so the label
 * supplied by the caller (e.g. `'profile:getPersonsByCreator'`) is the only
 * thing that can name what was actually denied.
 *
 * The op is always awaited so the label survives into production; the error is
 * rethrown untouched, leaving control flow to the caller.
 */
export async function withFirestoreErrorLog<T>(
  label: string,
  op: () => Promise<T>,
): Promise<T> {
  try {
    return await op();
  } catch (err) {
    reportFirestoreError(label, err);
    throw err;
  }
}

/** The reporting half of `withFirestoreErrorLog`, for errors a listener delivers. */
export function reportFirestoreError(label: string, err: unknown): void {
  if (firebaseErrorCode(err) !== 'permission-denied') return;
  observability.captureError(err, { operation: label });
  if (__DEV__) {
    let uid = 'anon';
    try {
      uid = getAuth().currentUser?.uid ?? 'anon';
    } catch {
      // Auth may not be initialised yet in odd edge cases — keep 'anon'.
    }
    console.warn(`[firestore-deny] label=${label} uid=${uid}`);
  }
}

/**
 * A listener's error. A one-off read reports permission-denied only (its other
 * failures are the caller's to handle); a listener's error is the screen's
 * error state, so every code is worth knowing — a missing index, a doc the
 * strict converter rejects.
 */
export function reportWatchError(label: string, err: unknown): void {
  if (firebaseErrorCode(err) === 'permission-denied') {
    reportFirestoreError(label, err);
    return;
  }
  observability.captureError(err, { operation: label, surface: 'watch' });
}

/** A listener that has given neither data nor an error after `afterMs`. */
export function reportWatchStall(label: string, afterMs: number): void {
  observability.captureError(new Error(`${label} gave no answer in ${String(afterMs / 1000)} s`), {
    operation: label,
    surface: 'watch-stall',
  });
}
