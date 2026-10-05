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

export function watchQuery<T>(
  q: Query<T>,
  onNext: (rows: (T & { id: string })[]) => void,
  onError: WatchError,
): Unwatch {
  return onSnapshot(
    q,
    (snap) => {
      onNext(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
      const data = snap.data();
      onNext(data === undefined ? null : { id: snap.id, ...data });
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
