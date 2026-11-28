import { Platform } from 'react-native';
import {
  configureObservability,
  OBSERVABILITY_EVENTS,
  type ObservabilityAdapter,
  type UserContext,
} from '@cultuvilla/shared';
import { createAnalyticsBackend } from './analytics';
import { createCrashlyticsBackend } from './crashlytics';
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

// The report already carries the error's own message, name and stack.
function withoutErrorFields(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  delete out['message'];
  delete out['name'];
  delete out['stack'];
  return out;
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
  const crashlytics = createCrashlyticsBackend();
  // Mirrors the port's consent so the exception event below, which the adapter
  // fires itself rather than through the port's gated trackEvent, obeys it too.
  let analyticsGranted = false;

  const adapter: ObservabilityAdapter = {
    trackEvent: (name, params, user) => analytics.trackEvent(name, params, user ? userIdOf(user) : null),
    captureError: (error, context) => {
      // Three sinks (design decision): Cloud Logging and Crashlytics for
      // diagnosis, which is legitimate interest and always goes, and an
      // analytics event for funnel/impact correlation, which is usage analytics
      // and needs consent. Crashlytics keeps the report next to the native
      // crashes it may precede; Cloud Logging joins it to the server's logs.
      const payload = toErrorPayload(error, context);
      void sendClientError(payload);
      crashlytics.recordError(error, withoutErrorFields(payload));
      if (analyticsGranted) analytics.trackEvent(OBSERVABILITY_EVENTS.APP_EXCEPTION, context, null);
    },
    // Client structured logs are Crashlytics breadcrumbs: they leave the device
    // only inside a crash or error report, as the steps that led to it.
    log: (level, msg, fields) => crashlytics.log(level, msg, fields),
    setUserContext: (user) => {
      const id = user ? userIdOf(user) : null;
      analytics.setUserId(id);
      crashlytics.setUserId(id);
    },
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
