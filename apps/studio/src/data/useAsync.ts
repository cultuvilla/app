import { useEffect, useState } from 'react';

export type AsyncState<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' };

/** Runs `load` whenever `key` changes; a stale result never lands. */
export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    setState({ status: 'loading' });
    load().then(
      (value) => {
        if (!cancelled) setState({ status: 'ready', value });
      },
      () => {
        if (!cancelled) setState({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is a fresh closure every render; `key` names what it loads.
  }, [key]);
  return state;
}
