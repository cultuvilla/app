import {
  onSnapshot,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from '../firebase/sdk/firestore';
import { firebaseErrorCode } from '../firebase/sdk/errors';
import { observability } from './observability/observabilityService';

/**
 * Live reads. On the native SDK a listener answers from the on-device cache
 * first and then from the server, so a screen built on these paints at once —
 * offline included — and stays current without reloading on focus
 * (docs/plans/ongoing/offline-first-village.md).
 *
 * Each `watch*` service function returns an `Unwatch`; callers own it.
 */
export type Unwatch = Unsubscribe;
export type WatchError = (error: Error) => void;

function allAnswered<T>(parts: (T[] | undefined)[]): parts is T[][] {
  return parts.every((rows) => rows !== undefined);
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Reading a snapshot runs the strict converter, which throws on a doc that does
 * not match its schema. Thrown inside the SDK's snapshot callback, that error
 * reaches no caller — the screen just stops rendering. Route it to `onError`,
 * so the screen shows its error state for that section instead.
 */
function readOrReport<R>(read: () => R, onNext: (value: R) => void, onError: WatchError): void {
  let value: R;
  try {
    value = read();
  } catch (err: unknown) {
    onError(asError(err));
    return;
  }
  onNext(value);
}

/**
 * A query read through `read`, for results that need more than each doc's data
 * — a parent path, a count. `read` sees the raw snapshots, so a doc it does not
 * call `data()` on is never parsed.
 */
export function watchQueryWith<T, R>(
  q: Query<T>,
  read: (docs: QueryDocumentSnapshot<T>[]) => R,
  onNext: (value: R) => void,
  onError: WatchError,
): Unwatch {
  return onSnapshot(
    q,
    (snap) => {
      readOrReport(() => read(snap.docs), onNext, onError);
    },
    (err: unknown) => {
      onError(asError(err));
    },
  );
}

export function watchQuery<T>(
  q: Query<T>,
  onNext: (rows: (T & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQueryWith(q, (docs) => docs.map((d) => ({ id: d.id, ...d.data() })), onNext, onError);
}

/**
 * How many docs match — the cache-friendly stand-in for `getCountFromServer`,
 * which cannot answer offline. Counts snapshots without parsing them, so for
 * small result sets only (a user's unread notifications), never a collection.
 */
export function watchCount<T>(q: Query<T>, onNext: (count: number) => void, onError: WatchError): Unwatch {
  return watchQueryWith(q, (docs) => docs.length, onNext, onError);
}

export function watchDoc<T>(
  ref: DocumentReference<T>,
  onNext: (row: (T & { id: string }) | null) => void,
  onError: WatchError,
): Unwatch {
  return onSnapshot(
    ref,
    (snap) => {
      readOrReport(
        () => {
          const data = snap.data();
          return data === undefined ? null : { id: snap.id, ...data };
        },
        onNext,
        onError,
      );
    },
    (err: unknown) => {
      onError(asError(err));
    },
  );
}

/**
 * A part that answers "no rows" when the rules refuse it, instead of failing.
 *
 * For a `watchMerged` part whose query the viewer may simply not be entitled
 * to: rules do not filter a list, they reject the whole query, so a refusal
 * means "nothing here you can read" — and because `watchMerged` waits for every
 * part, one refused part would otherwise blank the whole merge. Any other error
 * still fails.
 *
 * The refusal is still logged, at info: it is the expected answer for some
 * parts (an open org's private events), so it must not page anyone, but a
 * rules regression that starts refusing every part has to stay findable.
 */
export function forbiddenAsEmpty<T>(
  operation: string,
  part: (onNext: (rows: T[]) => void, onError: WatchError) => Unwatch,
): (onNext: (rows: T[]) => void, onError: WatchError) => Unwatch {
  return (onNext, onError) =>
    part(onNext, (error) => {
      if (firebaseErrorCode(error) === 'permission-denied') {
        observability.logger.info('watch part refused by rules; answered empty', { operation });
        onNext([]);
      } else onError(error);
    });
}

/**
 * One result from several listeners — e.g. one query per org, merged. Emits
 * only once every part has answered, so a caller never sees a partial merge
 * flash in; after that, any part's update re-emits the merge.
 */
export function watchMerged<T>(
  parts: ((onNext: (rows: T[]) => void, onError: WatchError) => Unwatch)[],
  merge: (rows: T[]) => T[],
  onNext: (rows: T[]) => void,
  onError: WatchError,
): Unwatch {
  if (parts.length === 0) {
    onNext(merge([]));
    return () => undefined;
  }
  const latest: (T[] | undefined)[] = parts.map(() => undefined);
  const unwatches = parts.map((part, i) =>
    part(
      (rows) => {
        latest[i] = rows;
        if (allAnswered(latest)) onNext(merge(latest.flat()));
      },
      onError,
    ),
  );
  return () => {
    for (const unwatch of unwatches) unwatch();
  };
}

/**
 * Several docs by id as one list, in the order given, missing docs dropped —
 * one listener per id, emitted once all have answered.
 */
export function watchDocsByIds<T>(
  ids: string[],
  watchOne: (id: string, onNext: (row: T | null) => void, onError: WatchError) => Unwatch,
  onNext: (rows: T[]) => void,
  onError: WatchError,
): Unwatch {
  const parts = ids.map(
    (id, index) => (next: (rows: { index: number; row: T }[]) => void, error: WatchError) =>
      watchOne(
        id,
        (row) => {
          next(row === null ? [] : [{ index, row }]);
        },
        error,
      ),
  );
  return watchMerged(
    parts,
    (rows) => [...rows].sort((a, b) => a.index - b.index),
    (rows) => {
      onNext(rows.map((r) => r.row));
    },
    onError,
  );
}
