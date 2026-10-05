import {
  onSnapshot,
  type DocumentReference,
  type Query,
  type Unsubscribe,
} from '../firebase/sdk/firestore';

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

export function watchQuery<T>(
  q: Query<T>,
  onNext: (rows: (T & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return onSnapshot(
    q,
    (snap) => {
      readOrReport(() => snap.docs.map((d) => ({ id: d.id, ...d.data() })), onNext, onError);
    },
    (err: unknown) => {
      onError(asError(err));
    },
  );
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
