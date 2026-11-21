import { Platform } from 'react-native';
import {
  configureObservability,
  OBSERVABILITY_EVENTS,
  type ObservabilityAdapter,
  type UserContext,
} from '@cultuvilla/shared';
import { createAnalyticsBackend } from './analytics';
import { sendClientError } from './errorBridge';
import { attachGlobalHandlers } from './globalHandlers';
import { getCurrentRoute } from './currentRoute';
import { getRunningVersion } from '../appVersion';

let booted = false;

// FirebaseError carries the machine-readable reason ('permission-denied',
// 'unavailable') on `code`; the human message alone cannot be classified.
function errorCodeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

function toErrorPayload(error: unknown, context: Record<string, unknown>): Record<string, unknown> {
  const e = error instanceof Error ? error : new Error(String(error));
  // The defaults come first so an explicit context value always wins.
  return {
    message: e.message,
    name: e.name,
    code: errorCodeOf(error),
    stack: e.stack,
    platform: Platform.OS,
    appVersion: getRunningVersion(),
    route: getCurrentRoute(),
    ...context,
  };
}

// The analytics user id is the (later hashed) uid; AuthContext supplies the hash
// via setUserContext once fetchUserIdHash resolves.
function userIdOf(user: UserContext): string {
  return user.uid;
}

export function bootstrapObservability(): void {
  if (booted) return;
  booted = true;

  const analytics = createAnalyticsBackend();
  // Mirrors the port's consent so the exception event below, which the adapter
  // fires itself rather than through the port's gated trackEvent, obeys it too.
  let analyticsGranted = false;

  const adapter: ObservabilityAdapter = {
    trackEvent: (name, params, user) => analytics.trackEvent(name, params, user ? userIdOf(user) : null),
    captureError: (error, context) => {
      // Both sinks (design decision): Cloud Logging for diagnosis, which is
      // legitimate interest and always goes, and an analytics event for
      // funnel/impact correlation, which is usage analytics and needs consent.
      void sendClientError(toErrorPayload(error, context));
      if (analyticsGranted) analytics.trackEvent(OBSERVABILITY_EVENTS.APP_EXCEPTION, context, null);
    },
    log: (_level, _msg, _fields) => {
      // Client structured logs currently ride the error bridge only for errors;
      // info/warn are dev-console today. Native Crashlytics breadcrumbs later.
    },
    setUserContext: (user) => analytics.setUserId(user ? userIdOf(user) : null),
    setConsent: (consent) => {
      analyticsGranted = consent.analytics;
      analytics.setConsent(consent.analytics);
    },
  };

  // The port starts with analytics denied and replays that here, which turns
  // native collection off on every launch. Only AnalyticsConsentProvider grants
  // it, for a signed-in account that answered yes (opt-in, Privacy Policy §4).
  // Before any JS runs, apps/mobile/firebase.json (analytics_auto_collection_enabled:
  // false) keeps a fresh install's native SDK from collecting on its own.
  configureObservability(adapter);
  attachGlobalHandlers();
}
