import { logger } from 'firebase-functions/v2';

/**
 * A trigger runs after the write that fired it, and the document it then
 * updates can be deleted in between — an account deletion, a cascade from a
 * deleted parent. `update()` rejects that with gRPC NOT_FOUND, and an
 * unhandled rejection fails the run (and, with retries, loops forever on a
 * document that will never come back). See
 * docs/decisions/triggers-tolerate-a-deleted-subject.md.
 *
 * The admin SDK reports the numeric gRPC code (5); the string forms cover the
 * client SDK shapes that reach the same helpers in tests.
 */
export function isNotFound(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 5 || code === 'NOT_FOUND' || code === 'not-found';
}

export interface SkipContext {
  /** The Cloud Function's name, as in every structured log. */
  handler: string;
  /** The document the write targeted. */
  path: string;
  [field: string]: unknown;
}

/**
 * Runs `update` — a write to a document the caller does not own the lifetime
 * of — and treats NOT_FOUND as "already gone": logs it at INFO (an expected
 * race, not an error an alert should fire on) and returns `false`. Every other
 * failure propagates. Returns `true` when the write landed.
 *
 * Inside a transaction this does not apply: the commit fails as a unit, so
 * read the document first and skip it when absent.
 */
export async function updateIfStillExists(update: () => Promise<unknown>, context: SkipContext): Promise<boolean> {
  try {
    await update();
    return true;
  } catch (err) {
    if (!isNotFound(err)) throw err;
    logger.info('Update skipped: document deleted', { ...context, reason: 'documentDeleted' });
    return false;
  }
}
