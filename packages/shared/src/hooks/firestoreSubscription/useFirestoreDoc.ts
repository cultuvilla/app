// React hook for subscribing to a single Firestore document, backed by the
// shared subscription cache. Multiple components reading the same doc share
// one underlying onSnapshot listener.

import { useEffect, useMemo, useRef, useState } from 'react';
import { onSnapshot, type DocumentReference, type DocumentSnapshot } from '../../firebase/sdk/firestore';

import { subscribe } from './cache';

export interface UseFirestoreDocOptions {
  enabled?: boolean;
  /** Override the auto-derived cache key. Defaults to the doc path. */
  cacheKey?: string;
}

export interface UseFirestoreDocResult<T = unknown> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

const deriveCacheKey = (ref: DocumentReference<unknown>, override?: string): string => {
  if (override) return `docKey:${override}`;
  return `doc:${ref.path}`;
};

export function useFirestoreDoc<T = unknown>(
  ref: DocumentReference<T> | null | undefined,
  options?: UseFirestoreDocOptions,
): UseFirestoreDocResult<T> {
  const enabled = options?.enabled !== false;
  const cacheKeyOverride = options?.cacheKey;

  const cacheKey = useMemo(() => {
    if (!ref || !enabled) return null;
    return deriveCacheKey(ref, cacheKeyOverride);
  }, [ref, enabled, cacheKeyOverride]);

  const [state, setState] = useState<UseFirestoreDocResult<T>>(() =>
    cacheKey
      ? { data: undefined, loading: true, error: null }
      : { data: undefined, loading: false, error: null },
  );

  const refHolder = useRef(ref);
  refHolder.current = ref;

  useEffect(() => {
    if (!cacheKey) {
      setState((prev) =>
        prev.loading || prev.data !== undefined || prev.error !== null
          ? { data: undefined, loading: false, error: null }
          : prev,
      );
      return;
    }

    setState((prev) => (prev.loading ? prev : { ...prev, loading: true, error: null }));

    const unsubscribe = subscribe<T | undefined>(
      cacheKey,
      (onNext, onError) => {
        const currentRef = refHolder.current;
        if (!currentRef) {
          return () => {};
        }
        return onSnapshot(
          currentRef,
          (snapshot: DocumentSnapshot<T>) => {
            onNext(snapshot.exists() ? (snapshot.data()) : undefined);
          },
          (err: unknown) => {
            onError(err instanceof Error ? err : new Error(String(err)));
          },
        );
      },
      (value, error) => {
        setState({ data: value, loading: false, error });
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cacheKey]);

  return state;
}
