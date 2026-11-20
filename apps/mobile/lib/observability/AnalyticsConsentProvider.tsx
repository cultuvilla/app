import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { observability } from '@cultuvilla/shared';
import { analyticsConsentGranted, type PrivacySettingsData } from '@cultuvilla/shared/models/user';
import {
  saveUsageAnalyticsConsent,
  watchPrivacySettings,
} from '@cultuvilla/shared/services/userService';
import { useAuth } from '../auth/useAuth';
import { AnalyticsConsentPage } from '../../components/feature/AnalyticsConsentPage';
import {
  isFlowRoute,
  localDayKey,
  onConsentPromptAction,
  promptReason,
  withAction,
  withAppDay,
  withUnansweredClose,
  type ConsentPromptState,
} from './analyticsConsentPrompt';
import { readConsentPromptState, writeConsentPromptState } from './consentPromptStore';

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

/** Lets a navigation transition finish before the page slides in over it. */
export const PAGE_SETTLE_MS = 700;

/**
 * Owns usage-analytics consent for the session. Analytics is opt-in (Privacy
 * Policy §4): off for guests, off until the signed-in account answers yes, and
 * off again the moment it signs out or says no. Error reporting to Cloud Logging
 * is not analytics and never waits on this.
 *
 * It also decides when an account that never answered sees the full-screen
 * question — the rule is analyticsConsentPrompt.ts; this wires it to the
 * device's storage, the calendar day and the current route.
 */
export function AnalyticsConsentProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const uid = user?.uid ?? null;
  const onboarded = Boolean(profile?.personId);
  const pathname = usePathname();
  const [settings, setSettings] = useState<{ uid: string; row: PrivacySettingsData | null } | undefined>();
  const [prompt, setPrompt] = useState<{ uid: string; state: ConsentPromptState } | undefined>();
  const [today, setToday] = useState(() => localDayKey(new Date()));
  // After an action, the screen it happened on: the page waits until the user leaves it.
  const [waitingOnPath, setWaitingOnPath] = useState<string | null>(null);
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

  // ── When to ask ──
  useEffect(() => {
    setPrompt(undefined);
    setWaitingOnPath(null);
    setVisible(false);
    if (!uid) return;
    let live = true;
    void readConsentPromptState(uid).then((state) => {
      if (live) setPrompt({ uid, state });
    });
    return () => {
      live = false;
    };
  }, [uid]);

  const promptState = uid !== null && prompt?.uid === uid ? prompt.state : undefined;

  const update = useCallback(
    (fn: (s: ConsentPromptState) => ConsentPromptState) => {
      if (!uid) return;
      setPrompt((p) => {
        if (p?.uid !== uid) return p;
        const next = fn(p.state);
        if (next === p.state) return p;
        void writeConsentPromptState(uid, next);
        return { uid, state: next };
      });
    },
    [uid],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(localDayKey(new Date()));
    });
    return () => sub.remove();
  }, []);

  // Counts the day once the stored state is in, so it never writes over it.
  const loaded = promptState !== undefined;
  useEffect(() => {
    if (loaded) update((s) => withAppDay(s, today));
  }, [loaded, today, update]);

  useEffect(
    () =>
      onConsentPromptAction(() => {
        update(withAction);
        setWaitingOnPath(pathname);
      }),
    [update, pathname],
  );

  useEffect(() => {
    if (waitingOnPath !== null && pathname !== waitingOnPath) setWaitingOnPath(null);
  }, [pathname, waitingOnPath]);

  const reason =
    promptState && settledFor !== uid ? promptReason({ answer, onboarded, state: promptState, today }) : null;
  const ordinaryScreen = !isFlowRoute(pathname);
  const showable =
    reason === 'day' ? ordinaryScreen : reason === 'action' ? ordinaryScreen && waitingOnPath === null : false;

  useEffect(() => {
    if (!showable) {
      if (reason === null) setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), PAGE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [showable, reason]);

  const onAnswer = (next: boolean) => {
    setVisible(false);
    setSettledFor(uid);
    setUsageAnalytics(next).catch((err: unknown) => {
      // Unstored: it asks again on a later launch, and no close is counted.
      observability.captureError(err, { operation: 'privacy:saveUsageAnalytics' });
    });
  };

  const onDismiss = () => {
    setVisible(false);
    update((s) => withUnansweredClose(s, today));
  };

  return (
    <AnalyticsConsentContext.Provider value={value}>
      {children}
      <AnalyticsConsentPage visible={visible && reason !== null} onAnswer={onAnswer} onDismiss={onDismiss} />
    </AnalyticsConsentContext.Provider>
  );
}
