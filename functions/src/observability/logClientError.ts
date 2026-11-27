import { log, redactPII } from '../shared/observability';
import { OBSERVABILITY_USER_ID_SALT } from './secret';
import { defineCallable } from '../shared/define/defineCallable';

const handler = 'logClientError';

// Only these keys are allowed out of a client payload into the log record.
// `message` is redacted; everything else is a bounded scalar.
function pickClientErrorAttrs(uid: string | null, data: unknown): Record<string, unknown> {
  const d = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.slice(0, 500) : undefined);
  return {
    handler,
    // Raw here; hashed by transformAttrs inside log.error. Absent for a
    // signed-out report — there is no identity to pseudonymize, and passing
    // a placeholder would hash into a fake "user" that groups every
    // anonymous error together as if one person hit them all.
    'user.id': uid ?? undefined,
    // Lets a query separate "a user hit this" from "someone who could not get
    // in hit this" — the auth-flow errors are exactly the anonymous ones.
    authenticated: uid !== null,
    'error.message': typeof d.message === 'string' ? redactPII(d.message.slice(0, 500)) : undefined,
    'error.name': str(d.name),
    // The machine-readable reason ('permission-denied', 'unavailable'); the
    // message alone is not classifiable, and for Firestore denials it is
    // identical for every rule that could have rejected the call.
    'error.code': str(d.code),
    'error.stack': str(d.stack),
    route: str(d.route),
    appVersion: str(d.appVersion),
    platform: str(d.platform),
    // The call site that produced the error (see withFirestoreErrorLog) —
    // the only thing that can name an otherwise opaque Firestore denial.
    operation: str(d.operation),
    operation_id: str(d.operation_id),
    surface: str(d.surface),
  };
}

/** Core logic, separated from the onCall envelope so it is unit-testable. */
export function runLogClientError(uid: string | null, data: unknown): void {
  log.error('client error', pickClientErrorAttrs(uid, data));
}

export const logClientError = defineCallable(
  'logClientError',
  { cors: true, secrets: [OBSERVABILITY_USER_ID_SALT] },
  (request) => {
    // Deliberately accepts unauthenticated calls. Requiring auth made every
    // failure in the sign-in flow invisible: there is no `request.auth` when
    // sign-in is what failed, so the callable rejected, `sendClientError`
    // swallowed the rejection, and the errors we most need to see were the
    // only ones that could never be reported. Apple rejected 1.0.0 over a
    // login error we had no telemetry for.
    //
    // The payload is not a new exposure: `pickClientErrorAttrs` allowlists a
    // dozen bounded scalars, truncates each to 500 chars and runs the message
    // through `redactPII`. What an anonymous caller can do is add log volume,
    // which is bounded by the same per-project quota as any other callable.
    runLogClientError(request.auth?.uid ?? null, request.data);
    return { ok: true as const };
  },
);
