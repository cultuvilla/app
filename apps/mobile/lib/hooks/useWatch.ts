import { useEffect, useState } from 'react';
import type { Unwatch, WatchError } from '@cultuvilla/shared/services/watch';
import { reportFirestoreError } from '../firestoreErrorLog';

export type WatchStatus = 'loading' | 'ready' | 'error';

export type Watcher<T> = (onNext: (value: T) => void, onError: WatchError) => Unwatch;

export interface WatchState<T> {
  data: T | undefined;
  status: WatchStatus;
  error: Error | null;
}

const IDLE = { data: undefined, status: 'ready', error: null } as const;

/**
 * Subscribes to a service `watch*` function for as long as `key` is unchanged.
 * Native listeners answer from the on-device cache first, so a revisited screen
 * paints at once and stays current without reloading on focus.
 *
 * `key` names what is watched (e.g. the municipality id): a new key resets to
 * `loading` and resubscribes; the same key keeps the open listener. A null
 * watcher is idle. The watcher itself is read on key change only, so callers
 * need not memoise it.
 */
export function useWatch<T>(label: string, key: string | null, watcher: Watcher<T> | null): WatchState<T> {
  const [state, setState] = useState<{ key: string | null; value: WatchState<T> }>({
    key,
    value: key && watcher ? { data: undefined, status: 'loading', error: null } : IDLE,
  });

  useEffect(() => {
    if (!key || !watcher) {
      setState({ key, value: IDLE });
      return;
    }
    setState((prev) =>
      prev.key === key && prev.value.status !== 'loading'
        ? prev
        : { key, value: { data: undefined, status: 'loading', error: null } },
    );
    return watcher(
      (data) => setState({ key, value: { data, status: 'ready', error: null } }),
      (error) => {
        reportFirestoreError(label, error);
        setState({ key, value: { data: undefined, status: 'error', error } });
      },
    );
    // The watcher is a fresh closure every render; `key` is what identifies it.
  }, [key, label]);

  // A key change renders once before the effect resets the state; never hand
  // that render the previous key's data.
  if (state.key !== key) {
    return key && watcher ? { data: undefined, status: 'loading', error: null } : IDLE;
  }
  return state.value;
}
