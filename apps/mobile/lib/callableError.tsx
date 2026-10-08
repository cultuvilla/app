// Context that wraps `classifyCallableError` with a UI surface. Provides a
// `showCallableError(error, options)` function that components — typically via
// `useCallable` — call from a `catch` block.
//
// The default surface is `Alert.alert`. The `headline` + `detail` come from
// `classifyCallableError`; callers can override either, plus attach an
// `onRefresh` action for the `stale-state` kind.

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Alert, type AlertButton } from 'react-native';

import {
  classifyCallableError,
  type CallableErrorKind,
  type ClassifiedCallableError,
} from '@cultuvilla/shared';

import { reportActionError } from './reportActionError';

export interface ShowCallableErrorOptions {
  /** Names the action in the error report (`event:save`). Default `action`. */
  operation?: string;
  /** Overrides the headline from the classifier. */
  headline?: string;
  /** Overrides the detail from the classifier. */
  detail?: string;
  /**
   * Action to wire to a "Recargar" button. When omitted on a `stale-state`
   * error, the alert only shows "OK".
   */
  onRefresh?: () => void | Promise<void>;
  /**
   * Inspect the classifier output before the alert renders — e.g. to log
   * to Sentry, or to swap the kind for a more specific one.
   */
  onClassified?: (classified: ClassifiedCallableError) => void;
}

export type ShowCallableError = (
  error: unknown,
  options?: ShowCallableErrorOptions,
) => void;

const Context = createContext<ShowCallableError | null>(null);

const REFRESH_KINDS: ReadonlyArray<CallableErrorKind> = ['stale-state', 'network'];

const defaultShowCallableError: ShowCallableError = (error, options) => {
  const classified = classifyCallableError(error);
  options?.onClassified?.(classified);

  const headline = options?.headline ?? classified.headline;
  const detail = options?.detail ?? classified.detail;

  const canRefresh = Boolean(options?.onRefresh) && REFRESH_KINDS.includes(classified.kind);

  const buttons: AlertButton[] = [];
  if (canRefresh) {
    buttons.push({
      text: 'Recargar',
      onPress: () => {
        void options?.onRefresh?.();
      },
    });
  }
  buttons.push({ text: 'OK', style: 'default' });

  Alert.alert(headline, detail, buttons, { cancelable: true });
};

export interface CallableErrorProviderProps {
  /** Override the default Alert-based surface (e.g. for a custom modal). */
  show?: ShowCallableError;
  children: ReactNode;
}

export function CallableErrorProvider({ show, children }: CallableErrorProviderProps) {
  const handler = useMemo<ShowCallableError>(() => show ?? defaultShowCallableError, [show]);
  return <Context.Provider value={handler}>{children}</Context.Provider>;
}

export function useCallableErrorHandler(): ShowCallableError {
  const handler = useContext(Context);
  // A consumer outside the provider is legitimate during very early app boot.
  // Fall back to the default surface so callsites never crash on first paint.
  // Reported here rather than in the surface, so a provider that swaps the
  // Alert for its own modal still reports.
  return useCallback<ShowCallableError>(
    (error, options) => {
      reportActionError(options?.operation ?? 'action', error, classifyCallableError(error));
      (handler ?? defaultShowCallableError)(error, options);
    },
    [handler],
  );
}
