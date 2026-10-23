import { routes } from '../navigation/routes';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { router, useRootNavigationState, type Href } from 'expo-router';
import { markAsRead, registerDevice } from '@cultuvilla/shared/services/notificationService';
import { useAuth } from '../auth/useAuth';
import { useT } from '../i18n';
import { PushSoftAskSheet } from '../../components/feature/PushSoftAskSheet';
import {
  configureForegroundPresentation,
  consumeLaunchTap,
  ensureAndroidChannels,
  getPushPermission,
  getPushRegistration,
  onPushTap,
  onPushTokenRefresh,
  requestPushPermission,
  type PushPermission,
  type PushTapData,
} from './pushClient';
import { recordSoftAsk, shouldOfferSoftAsk, type SoftAskTrigger } from './softAskPolicy';
import { loadSoftAskState, saveSoftAskState } from './softAskStore';
import { rememberRegisteredToken } from './pushSession';

export interface OfferPushContext {
  villageName?: string;
}

interface PushContextValue {
  /**
   * Call right after something push would genuinely help with. Shows the
   * soft-ask sheet only if the policy allows — callers never need to check.
   */
  offerPush: (trigger: SoftAskTrigger, context?: OfferPushContext) => void;
  /** Current OS permission; `unsupported` on web. */
  permission: PushPermission;
  /** Re-reads the OS permission, e.g. after returning from system settings. */
  refreshPermission: () => Promise<PushPermission>;
  /** Asks the OS directly — for the explicit button in Ajustes, not for nudges. */
  requestPermission: () => Promise<PushPermission>;
}

const PushContext = createContext<PushContextValue | null>(null);

/**
 * Every trigger fires as another sheet is closing (the sign-up sheet, the
 * join-village sheet). iOS cannot present a Modal while one is still animating
 * out — the second is silently dropped — so the ask waits for the handoff.
 */
const SHEET_HANDOFF_MS = 450;

function routeFromTap(data: PushTapData): string {
  const route = data['route'];
  // A notification about nothing openable still lands somewhere useful.
  return typeof route === 'string' && route.startsWith('/') ? route : routes.inbox;
}

export function PushProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { user, profile, profileChecked } = useAuth();
  const uid = user?.uid ?? null;
  const navReady = Boolean(useRootNavigationState()?.key);
  // AuthGate redirects a signed-in user with no profile to onboarding; a push
  // route opened before that settles would be immediately overwritten.
  const canRoute = navReady && uid !== null && profileChecked && Boolean(profile?.personId);

  const [permission, setPermission] = useState<PushPermission>('undetermined');
  const [pending, setPending] = useState<{ trigger: SoftAskTrigger; context: OfferPushContext } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const register = useCallback(async (forUid: string) => {
    const registration = await getPushRegistration();
    if (!registration) return;
    try {
      await registerDevice(forUid, registration);
      rememberRegisteredToken(forUid, registration.token);
    } catch {
      // Best-effort: the next launch retries, and the Buzón has everything.
    }
  }, []);

  // Channels before anything else — Android 13 will not show the permission
  // dialog until one exists, and a push naming a missing channel is dropped.
  useEffect(() => {
    configureForegroundPresentation();
    void ensureAndroidChannels({
      mine: t('notifications.channels.mine'),
      village: t('notifications.channels.village'),
      social: t('notifications.channels.social'),
      groups: t('notifications.channels.groups'),
    }).then(async () => setPermission(await getPushPermission()));
  }, [t]);

  // Every launch while signed in: refresh this device's row (idempotent — the
  // doc id is the token) and follow token rotation.
  useEffect(() => {
    if (!uid) return;
    void register(uid);
    return onPushTokenRefresh(() => {
      void register(uid);
    });
  }, [uid, register]);

  // Taps. The notification id rides in the payload, so the tap can mark it read
  // without a lookup — opening a push and still seeing it unread in the Buzón
  // would make the badge a liar.
  const open = useCallback((data: PushTapData) => {
    const current = uidRef.current;
    const notificationId = data['notificationId'];
    if (current && typeof notificationId === 'string') {
      void markAsRead(current, notificationId).catch(() => undefined);
    }
    router.push(routeFromTap(data) as Href);
  }, []);

  useEffect(() => onPushTap(open), [open]);

  // Cold start: the tap that LAUNCHED the app. Held until navigation is mounted
  // and the auth/onboarding gate has settled — pushing a route before then
  // races AuthGate's own redirect and loses.
  useEffect(() => {
    if (!canRoute) return;
    const launch = consumeLaunchTap();
    if (launch) open(launch);
  }, [canRoute, open]);

  const refreshPermission = useCallback(async () => {
    const next = await getPushPermission();
    setPermission(next);
    return next;
  }, []);

  const requestPermission = useCallback(async () => {
    const next = await requestPushPermission();
    setPermission(next);
    if (next === 'granted' && uidRef.current) await register(uidRef.current);
    return next;
  }, [register]);

  const offerPush = useCallback((trigger: SoftAskTrigger, context: OfferPushContext = {}) => {
    void (async () => {
      const [current, state] = await Promise.all([getPushPermission(), loadSoftAskState()]);
      setPermission(current);
      if (!shouldOfferSoftAsk({ trigger, permission: current, state, now: Date.now() })) return;
      // Counted as asked the moment it is SHOWN, whatever the answer — the
      // ration is on interruptions, not on refusals.
      await saveSoftAskState(recordSoftAsk(state, Date.now()));
      setTimeout(() => {
        setPending({ trigger, context });
      }, SHEET_HANDOFF_MS);
    })();
  }, []);

  const accept = useCallback(() => {
    setBusy(true);
    void requestPermission().finally(() => {
      setBusy(false);
      setPending(null);
    });
  }, [requestPermission]);

  const decline = useCallback(() => {
    setPending(null);
  }, []);

  return (
    <PushContext.Provider value={{ offerPush, permission, refreshPermission, requestPermission }}>
      {children}
      <PushSoftAskSheet
        trigger={pending?.trigger ?? null}
        villageName={pending?.context.villageName}
        busy={busy}
        onAccept={accept}
        onDecline={decline}
      />
    </PushContext.Provider>
  );
}

export function usePush(): PushContextValue {
  const v = useContext(PushContext);
  if (!v) throw new Error('usePush must be inside <PushProvider>');
  return v;
}
