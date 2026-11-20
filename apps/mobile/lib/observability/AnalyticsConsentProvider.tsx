import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { observability } from '@cultuvilla/shared';
import { analyticsConsentGranted, type PrivacySettingsData } from '@cultuvilla/shared/models/user';
import {
  saveUsageAnalyticsConsent,
  watchPrivacySettings,
} from '@cultuvilla/shared/services/userService';
import { useAuth } from '../auth/useAuth';
import { AnalyticsConsentSheet } from '../../components/feature/AnalyticsConsentSheet';

export interface AnalyticsConsentValue {
  /**
   * The signed-in account's answer: `true`/`false`, `null` when it was never
   * asked, `undefined` while it loads or with nobody signed in.
   */
  answer: boolean | null | undefined;
  /** Records the answer (first time or a later change); applied as soon as it is written. */
  setUsageAnalytics: (granted: boolean) => Promise<void>;
}

const AnalyticsConsentContext = createContext<AnalyticsConsentValue | null>(null);

export function useAnalyticsConsent(): AnalyticsConsentValue {
  const v = useContext(AnalyticsConsentContext);
  if (!v) throw new Error('useAnalyticsConsent must be used within AnalyticsConsentProvider');
  return v;
}

/**
 * Owns usage-analytics consent for the session. Analytics is opt-in (Privacy
 * Policy §4): off for guests, off until the signed-in account answers yes, and
 * off again the moment it signs out or says no. Error reporting to Cloud Logging
 * is not analytics and never waits on this.
 *
 * An onboarded account that was never asked gets the question once, as a sheet;
 * closing it without answering leaves it unasked, so the next launch asks again.
 */
export function AnalyticsConsentProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const [settings, setSettings] = useState<{ uid: string; row: PrivacySettingsData | null } | undefined>();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSettings(undefined);
    if (!uid) return;
    return watchPrivacySettings(
      uid,
      (row) => setSettings({ uid, row }),
      (err) => observability.captureError(err, { operation: 'privacy:watchSettings' }),
    );
  }, [uid]);

  // A row read for an account that is no longer signed in never applies.
  const current = uid !== null && settings?.uid === uid ? settings.row : undefined;
  const granted = analyticsConsentGranted(uid !== null, current);

  useEffect(() => {
    observability.setConsent({ analytics: granted });
  }, [granted]);

  const setUsageAnalytics = useCallback(
    async (next: boolean) => {
      if (!uid) return;
      await saveUsageAnalyticsConsent(uid, next);
    },
    [uid],
  );

  const answer = current === undefined ? undefined : current === null ? null : current.usageAnalytics;
  const value = useMemo(() => ({ answer, setUsageAnalytics }), [answer, setUsageAnalytics]);

  // Onboarding asks in its own form; the sheet is for an account that finished
  // it without answering — every account that predates the question.
  const ask = uid !== null && Boolean(profile?.personId) && answer === null && dismissedFor !== uid;

  const onAnswer = (next: boolean) => {
    setBusy(true);
    setUsageAnalytics(next)
      .catch((err: unknown) => {
        observability.captureError(err, { operation: 'privacy:saveUsageAnalytics' });
        setDismissedFor(uid);
      })
      .finally(() => setBusy(false));
  };

  return (
    <AnalyticsConsentContext.Provider value={value}>
      {children}
      <AnalyticsConsentSheet
        visible={ask}
        busy={busy}
        onAnswer={onAnswer}
        onDismiss={() => setDismissedFor(uid)}
      />
    </AnalyticsConsentContext.Provider>
  );
}
