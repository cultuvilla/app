import { firebaseErrorCode } from '@cultuvilla/shared/firebase/sdk/errors';

/**
 * Classifies a caught error into a user-facing bucket so <ErrorState> can show a
 * message the reader can act on ("check your connection") instead of a raw
 * exception. Accepts either the thrown value or an already-extracted message
 * string, since some call sites only keep `e.message` in state.
 *
 * - `network`: transient connectivity — Firestore offline/unavailable, fetch
 *   failures. Retrying (later) is the right advice.
 * - `data`: the strict Zod converter rejected a document's shape. Retrying won't
 *   help the user, but "try later" is honest — it's on us to fix the data.
 * - `unknown`: anything else.
 */
export type ErrorKind = 'network' | 'data' | 'unknown';

// Firestore/GRPC status codes (prefix-free; see firebaseErrorCode) that mean "connectivity", not "bad request".
const NETWORK_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'cancelled',
  'resource-exhausted',
]);

const NETWORK_RE =
  /network|offline|failed to fetch|network request failed|econnreset|etimedout|timeout|internet/i;

function fromMessage(message: string): ErrorKind {
  const trimmed = message.trim();
  // Zod stringifies its issues array as the error message; a strict converter
  // throwing on a missing field looks like `[{"code":"invalid_type",...}]`.
  if (trimmed.startsWith('[') && /"code"\s*:/.test(trimmed)) return 'data';
  if (NETWORK_RE.test(trimmed)) return 'network';
  return 'unknown';
}

export function errorKind(e: unknown): ErrorKind {
  if (e == null) return 'unknown';

  if (typeof e === 'object') {
    const err = e as { code?: unknown; name?: unknown; message?: unknown; issues?: unknown };
    if (err.name === 'ZodError' || Array.isArray(err.issues)) return 'data';
    const code = firebaseErrorCode(err);
    if (code && NETWORK_CODES.has(code)) return 'network';
    if (typeof err.message === 'string') return fromMessage(err.message);
    return 'unknown';
  }

  if (typeof e === 'string') return fromMessage(e);
  return 'unknown';
}
