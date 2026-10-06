import {
  getAnalytics,
  logEvent,
  setAnalyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/analytics';

type NativeAnalytics = ReturnType<typeof getAnalytics>;
type NativeParam = string | number;

// GA4's native SDKs only accept [A-Za-z][A-Za-z0-9_]{0,39}; our taxonomy is
// dotted (`event.signup.success`), which web gtag tolerates and native rejects
// with a throw. Map dots to underscores here so both platforms keep one
// catalogue — query BigQuery with REPLACE(event_name, '.', '_') to join them.
export function toNativeEventName(name: string): string {
  return name.replace(/\./g, '_');
}

// Native params take strings and numbers only; booleans would be dropped by the
// SDK, so they become 0/1 to stay countable.
export function toNativeParams(params: Record<string, unknown>): Record<string, NativeParam> {
  const out: Record<string, NativeParam> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') out[key] = value;
    else if (typeof value === 'boolean') out[key] = value ? 1 : 0;
  }
  return out;
}

// A build without this env's GoogleService-Info.plist / google-services.json has
// no default native Firebase app, and getAnalytics throws. Analytics must never
// take the app down, so every path degrades to a no-op.
let analytics: NativeAnalytics | null | undefined;
function instance(): NativeAnalytics | null {
  if (analytics !== undefined) return analytics;
  try {
    analytics = getAnalytics();
  } catch {
    analytics = null;
  }
  return analytics;
}

export function createAnalyticsBackend() {
  return {
    trackEvent: (name: string, params: Record<string, unknown>, userId: string | null) => {
      const a = instance();
      if (!a) return;
      const nativeParams = toNativeParams(params);
      if (userId) nativeParams['user_id'] = userId;
      // logEvent validates synchronously (throws) and logs asynchronously
      // (rejects, though typed void); a telemetry call must survive both.
      try {
        Promise.resolve(logEvent(a, toNativeEventName(name), nativeParams)).catch(() => {
          /* fire-and-forget */
        });
      } catch {
        /* fire-and-forget */
      }
    },
    setConsent: (granted: boolean) => {
      const a = instance();
      if (!a) return;
      setAnalyticsCollectionEnabled(a, granted).catch(() => {
        /* ignore */
      });
    },
    setUserId: (id: string | null) => {
      const a = instance();
      if (!a) return;
      setUserId(a, id).catch(() => {
        /* ignore */
      });
    },
  };
}

export function _resetNativeAnalyticsForTests(): void {
  analytics = undefined;
}
