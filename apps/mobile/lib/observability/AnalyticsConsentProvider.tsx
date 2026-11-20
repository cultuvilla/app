import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { observability } from '@cultuvilla/shared';
import { analyticsConsentGranted, type PrivacySettingsData } from '@cultuvilla/shared/models/user';
import {
  saveUsageAnalyticsConsent,
  watchPrivacySettings,
} from '@cultuvilla/shared/services/userService';
import { useAuth } from '../auth/useAuth';
import { AnalyticsConsentPage } from '../../components/feature/AnalyticsConsentPage';

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

/** Lets the first screen paint before the page slides in over it. */
export const PAGE_SETTLE_MS = 700;

/**
 * Owns usage-analytics consent for the session. Analytics is opt-in (Privacy
 * Policy §4): off for guests, off until the signed-in account answers yes, and
 * off again the moment it signs out or says no. Error reporting to Cloud Logging
 * is not analytics and never waits on this.
 *
 * An onboarded account that never answered is asked at once, full screen, the
 * moment the app opens (decided 2026-11-20, Álvaro: every user answers right
 * away). There is no way past it but an answer.
 */
export function AnalyticsConsentProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const onboarded = Boolean(profile?.personId);
  const [settings, setSettings] = useState<{ uid: string; row: PrivacySettingsData | null } | undefined>();
  // Answered (or failed to store) this session: hidden until the next launch at least.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

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

  const owed = answer === null && onboarded && settledFor !== uid;

  useEffect(() => {
    if (!owed) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), PAGE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [owed]);

  const onAnswer = (next: boolean) => {
    setVisible(false);
    setSettledFor(uid);
    setUsageAnalytics(next).catch((err: unknown) => {
      // Unstored: it asks again on the next launch.
      observability.captureError(err, { operation: 'privacy:saveUsageAnalytics' });
    });
  };

  return (
    <AnalyticsConsentContext.Provider value={value}>
      {children}
      <AnalyticsConsentPage visible={visible && owed} onAnswer={onAnswer} />
    </AnalyticsConsentContext.Provider>
  );
}
