import { useEffect, useState } from 'react';
import type { Unwatch, WatchError } from '@cultuvilla/shared/services/watch';
import { reportWatchError, reportWatchStall } from '../firestoreErrorLog';

export type WatchStatus = 'loading' | 'ready' | 'error';

export type Watcher<T> = (onNext: (value: T) => void, onError: WatchError) => Unwatch;

export interface WatchState<T> {
  data: T | undefined;
  status: WatchStatus;
  error: Error | null;
}

const IDLE = { data: undefined, status: 'ready', error: null } as const;

/**
 * A listener answers from the device cache at once and from the server within
 * seconds. One silent this long leaves its screen on a spinner, which no error
 * path ever reports (the iOS news list in CI, 2026-10-10).
 */
const STALL_MS = 20_000;

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
    let answered = false;
    const stall = setTimeout(() => {
      if (!answered) reportWatchStall(label, STALL_MS);
    }, STALL_MS);
    const answer = () => {
      answered = true;
      clearTimeout(stall);
    };
    const unwatch = watcher(
      (data) => {
        answer();
        setState({ key, value: { data, status: 'ready', error: null } });
      },
      (error) => {
        answer();
        reportWatchError(label, error);
        setState({ key, value: { data: undefined, status: 'error', error } });
      },
    );
    return () => {
      clearTimeout(stall);
      unwatch();
    };
    // The watcher is a fresh closure every render; `key` is what identifies it.
  }, [key, label]);

  // A key change renders once before the effect resets the state; never hand
  // that render the previous key's data.
  if (state.key !== key) {
    return key && watcher ? { data: undefined, status: 'loading', error: null } : IDLE;
  }
  return state.value;
}
