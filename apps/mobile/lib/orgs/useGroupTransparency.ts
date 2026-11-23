import { useEffect, useState } from 'react';

export type TransparencyState<T> =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: T }
  | { status: 'error'; data: null };

/**
 * One read of what a group's junta made public (`groupTransparencyService`),
 * fetched when the screen opens and again when `key` changes. A callable, not
 * a listener: these views are built server-side so that no socio ever receives
 * the fields behind them. A null key reads nothing (the switch is off).
 */
export function useGroupTransparency<T>(key: string | null, fetcher: () => Promise<T>): TransparencyState<T> {
  const [state, setState] = useState<{ key: string | null; value: TransparencyState<T> }>({
    key,
    value: key ? { status: 'loading', data: null } : { status: 'idle', data: null },
  });

  useEffect(() => {
    if (!key) {
      setState({ key, value: { status: 'idle', data: null } });
      return;
    }
    let cancelled = false;
    setState({ key, value: { status: 'loading', data: null } });
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ key, value: { status: 'ready', data } });
      })
      .catch(() => {
        if (!cancelled) setState({ key, value: { status: 'error', data: null } });
      });
    return () => {
      cancelled = true;
    };
    // The fetcher is read on key change only, like useWatch's watcher, so callers need not memoise it.
  }, [key]);

  if (state.key !== key) return key ? { status: 'loading', data: null } : { status: 'idle', data: null };
  return state.value;
}
