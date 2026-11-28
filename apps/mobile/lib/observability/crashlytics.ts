import {
  getCrashlytics,
  log,
  recordError,
  setUserId,
} from '@react-native-firebase/crashlytics';

type NativeCrashlytics = ReturnType<typeof getCrashlytics>;

// Native crashes, ANRs and OOMs need no call from here: the SDK records them on
// its own once linked. This backend adds what only JS knows — handled errors
// (non-fatal reports with their JS stack), breadcrumbs and the user hash — so a
// native crash report carries the screen and the steps that led to it.
//
// Collection is diagnosis, the same legitimate interest as the Cloud Logging
// sink (Privacy Policy §4), so it is not tied to the analytics consent. Debug
// builds collect nothing: the SDK's `crashlytics_debug_enabled` defaults off.
//
// apps/mobile/firebase.json switches off the SDK's own report of an uncaught JS
// error (`crashlytics_is_error_generation_on_js_crash_enabled`): globalHandlers
// already sends each one through captureError, so the SDK's would file it twice
// and also log an `app_exception` analytics event outside the consent gate.

// A build without this env's native Firebase config has no default app, and
// getCrashlytics throws. Crash reporting must never take the app down.
let crashlytics: NativeCrashlytics | null | undefined;
function instance(): NativeCrashlytics | null {
  if (crashlytics !== undefined) return crashlytics;
  try {
    crashlytics = getCrashlytics();
  } catch {
    crashlytics = null;
  }
  return crashlytics;
}

function swallow(fn: () => unknown): void {
  try {
    const result = fn();
    if (result instanceof Promise) result.catch(() => undefined);
  } catch {
    /* fire-and-forget */
  }
}

// Crashlytics log lines are plain strings, so structured fields ride as a
// trailing `(key=value, …)` suffix that stays greppable in the crash log.
export function toBreadcrumb(level: string, msg: string, fields: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
  }
  return `[${level}] ${msg}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

export function createCrashlyticsBackend() {
  return {
    recordError: (error: unknown, context: Record<string, unknown>) => {
      const c = instance();
      if (!c) return;
      const e = error instanceof Error ? error : new Error(String(error));
      // The context goes in as a log line, not as custom keys: keys are sticky
      // and would stamp this error's route and operation onto a later crash.
      swallow(() => log(c, toBreadcrumb('error', e.message, context)));
      swallow(() => recordError(c, e));
    },
    log: (level: string, msg: string, fields: Record<string, unknown>) => {
      const c = instance();
      if (!c) return;
      swallow(() => log(c, toBreadcrumb(level, msg, fields)));
    },
    // The id is the server-side HMAC of the uid (fetchUserIdHash), never the
    // uid itself; an empty string clears it on sign-out.
    setUserId: (id: string | null) => {
      const c = instance();
      if (!c) return;
      swallow(() => setUserId(c, id ?? ''));
    },
  };
}

export function _resetNativeCrashlyticsForTests(): void {
  crashlytics = undefined;
}
