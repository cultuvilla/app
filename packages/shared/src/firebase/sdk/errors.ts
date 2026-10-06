/**
 * The Firebase error code without its service prefix. The two SDKs disagree on
 * prefixes — the JS SDK says `permission-denied` for Firestore and
 * `functions/not-found` for callables, the native SDK the reverse — so compare
 * codes through this, never by raw string.
 */
export function firebaseErrorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || code === '') return null;
  const slash = code.indexOf('/');
  return slash === -1 ? code : code.slice(slash + 1);
}
