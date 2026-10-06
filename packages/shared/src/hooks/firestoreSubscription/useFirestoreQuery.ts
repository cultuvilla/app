// React hook for subscribing to a Firestore query, backed by the shared
// subscription cache. Multiple components subscribing to queries that resolve
// to the same cache key share a single underlying Firestore listener.
//
// Cache-key derivation for queries is harder than for docs: a `Query` has no
// `.path` field. We try, in order:
//   1. `options.cacheKey` (caller override)
//   2. modular SDK internal `_query.canonicalId()` if present
//   3. modular SDK internal `_query.path.canonicalString()` + segments
//   4. last resort: per-object identity via a WeakMap — *not* shareable across
//      callsites but at least correct for a single render tree.
//
// Callers building dynamic queries (e.g. chains of `where(...)` based on
// runtime filters) should pass an explicit `cacheKey` derived from the filter
// shape. The auto-derivation reaches into SDK internals as a best effort and
// must not be relied on for cross-component listener sharing.

import { useEffect, useMemo, useRef, useState } from 'react';
import { onSnapshot, type Query, type QuerySnapshot } from '../../firebase/sdk/firestore';

import { subscribe } from './cache';

export interface UseFirestoreQueryOptions {
  enabled?: boolean;
  /**
   * Override the auto-derived cache key. Use this whenever multiple components
   * need to share a listener for a query whose canonical form isn't stable
   * (e.g. dynamically-constructed `where` chains).
   */
  cacheKey?: string;
}

export interface UseFirestoreQueryResult<T = unknown> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

type ModularQueryInternals = {
  _query?: {
    canonicalId?: () => string;
    path?: {
      canonicalString?: () => string;
      segments?: string[];
    };
  };
};

let fallbackKeyCounter = 0;
const fallbackKeyByQuery = new WeakMap<object, string>();

const deriveCacheKey = <T,>(query: Query<T>, override?: string): string => {
  if (override) return `queryKey:${override}`;

  // Reaching into SDK internals — every level is defensively optional in
  // practice even though the cast types them as present, since this code runs
  // against multiple SDK versions and shims (RN, web, tests).
  const internals = query as unknown as ModularQueryInternals;
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  const canonical = internals?._query?.canonicalId?.();
  if (canonical) return `query:${canonical}`;

  const canonicalPath = internals?._query?.path?.canonicalString?.();
  if (canonicalPath) return `query:${canonicalPath}`;

  const segments = internals?._query?.path?.segments;
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  if (Array.isArray(segments) && segments.length > 0) {
    return `query:${segments.join('/')}`;
  }

  const identity = query as object;
  let key = fallbackKeyByQuery.get(identity);
  if (!key) {
    fallbackKeyCounter += 1;
    key = `query:fallback:${String(fallbackKeyCounter)}`;
    fallbackKeyByQuery.set(identity, key);
  }
  return key;
};

// Frozen, shared empty array. Freezing it makes accidental mutation
// (`result.data.push(...)`) throw rather than silently corrupt the shared
// instance handed to other consumers.
const emptyArray = <T,>(): T[] => Object.freeze([]) as unknown as T[];

export function useFirestoreQuery<T = unknown>(
  query: Query<T> | null | undefined,
  options?: UseFirestoreQueryOptions,
): UseFirestoreQueryResult<T> {
  const enabled = options?.enabled !== false;
  const cacheKeyOverride = options?.cacheKey;

  const cacheKey = useMemo(() => {
    if (!query || !enabled) return null;
    return deriveCacheKey(query, cacheKeyOverride);
  }, [query, enabled, cacheKeyOverride]);

  const [state, setState] = useState<UseFirestoreQueryResult<T>>(() =>
    cacheKey
      ? { data: emptyArray<T>(), loading: true, error: null }
      : { data: emptyArray<T>(), loading: false, error: null },
  );

  const queryHolder = useRef(query);
  queryHolder.current = query;

  useEffect(() => {
    if (!cacheKey) {
      setState((prev) =>
        prev.loading || prev.data.length > 0 || prev.error !== null
          ? { data: emptyArray<T>(), loading: false, error: null }
          : prev,
      );
      return;
    }

    setState((prev) => (prev.loading ? prev : { ...prev, loading: true, error: null }));

    const unsubscribe = subscribe<T[]>(
      cacheKey,
      (onNext, onError) => {
        const currentQuery = queryHolder.current;
        if (!currentQuery) {
          return () => {};
        }
        return onSnapshot(
          currentQuery,
          (snapshot: QuerySnapshot<T>) => {
            const docs: T[] = snapshot.docs.map((d) => d.data());
            onNext(docs);
          },
          (err: unknown) => {
            onError(err instanceof Error ? err : new Error(String(err)));
          },
        );
      },
      (value, error) => {
        setState({
          data: value ?? emptyArray<T>(),
          loading: false,
          error,
        });
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cacheKey]);

  return state;
}
