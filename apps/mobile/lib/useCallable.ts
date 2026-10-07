// Standardizes the `setLoading(true) … try { await callable() } catch
// { showCallableError(e) } finally { setLoading(false) }` boilerplate
// repeated across every action button. Returns a stable `fire` and an
// `isPending` flag — bind buttons' `disabled={isPending}` to kill the
// rapid-tap double-fire bug for free.

import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  useCallableErrorHandler,
  type ShowCallableErrorOptions,
} from './callableError';

export interface UseCallableOptions<TArgs extends unknown[], TResult> {
  /** The callable / service function to invoke. */
  callable: (...args: TArgs) => Promise<TResult>;
  /**
   * Forwarded to `showCallableError`. Pass `() => ({ onRefresh })` (a
   * function) when the options depend on values that change between renders.
   */
  errorOptions?: ShowCallableErrorOptions | (() => ShowCallableErrorOptions);
  /** Runs after the callable resolves, before `isPending` flips false. */
  onSuccess?: (result: TResult) => void | Promise<void>;
  /**
   * When true, errors are surfaced via the modal but not re-thrown.
   * Default: errors re-throw so the caller can branch on success.
   */
  swallow?: boolean;
}

export interface UseCallableReturn<TArgs extends unknown[], TResult> {
  /** Invoke the wrapped callable. Sets `isPending` true while in flight. */
  fire: (...args: TArgs) => Promise<TResult | undefined>;
  isPending: boolean;
}

export function useCallable<TArgs extends unknown[], TResult>(
  options: UseCallableOptions<TArgs, TResult>,
): UseCallableReturn<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false);
  const showCallableError = useCallableErrorHandler();

  // Stash latest options in a ref so `fire`'s identity stays stable.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Guard against overlapping invocations. Rapid taps that bypass the
  // disabled-button guard (gesture, a11y) land here and become no-ops.
  const inFlightRef = useRef(false);

  const fire = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (inFlightRef.current) return undefined;
      inFlightRef.current = true;
      setIsPending(true);
      try {
        const result = await optionsRef.current.callable(...args);
        if (optionsRef.current.onSuccess) {
          try {
            await optionsRef.current.onSuccess(result);
          } catch (successError) {
            // onSuccess is best-effort UX hookup (refresh, navigation). Don't
            // let it mask the underlying callable's success.
            console.warn('[useCallable] onSuccess threw', successError);
          }
        }
        return result;
      } catch (error) {
        const errorOpts =
          typeof optionsRef.current.errorOptions === 'function'
            ? optionsRef.current.errorOptions()
            : optionsRef.current.errorOptions;
        try {
          showCallableError(error, errorOpts);
        } catch (modalError) {
          // Last-resort: the global handler itself blew up. Don't lose the
          // original error — fall back to a bare alert and re-throw.
          const message = error instanceof Error ? error.message : 'No se pudo completar la acción.';
          Alert.alert('Error', message);
          console.error('[useCallable] showCallableError threw', modalError);
        }
        if (!optionsRef.current.swallow) {
          throw error;
        }
        return undefined;
      } finally {
        inFlightRef.current = false;
        setIsPending(false);
      }
    },
    [showCallableError],
  );

  return { fire, isPending };
}
