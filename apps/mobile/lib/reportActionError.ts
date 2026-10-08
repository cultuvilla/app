import { observability, type ClassifiedCallableError } from '@cultuvilla/shared';

/**
 * The kinds that point at a defect or a broken environment, not at the person:
 * a rule refusing what the app let them try, or an error nothing recognises.
 * A full event, a stale doc or a dropped connection is an outcome the alert
 * already explains, and would bury the real failures.
 */
const REPORTED_KINDS: ReadonlySet<ClassifiedCallableError['kind']> = new Set(['permission', 'unknown']);

/**
 * Reports a failed user action to observability, alongside the alert the
 * person sees.
 *
 * 2026-10-07: every event cover upload in prod failed with
 * `storage/unauthorized` for hours. The person got «No tienes permiso para
 * hacer esta acción»; Cloud Logging got nothing, because the action error path
 * only showed the alert. A user reported it.
 *
 * `operation` names the action (`event:save`); the adapter adds the route and
 * the raw error's `code` and `message`.
 */
export function reportActionError(
  operation: string,
  error: unknown,
  classified: ClassifiedCallableError,
): void {
  if (!REPORTED_KINDS.has(classified.kind)) return;
  observability.captureError(error, { operation, surface: 'action' });
}
