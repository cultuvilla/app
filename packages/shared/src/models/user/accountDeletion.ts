/**
 * How recent a sign-in `deleteAccount` accepts, in seconds. Erasure cannot be
 * undone, so a long-lived (or stolen) session is not enough on its own: the
 * caller must have signed in within this window.
 */
export const FRESH_AUTH_WINDOW_SEC = 300;

/**
 * Tolerance for an `auth_time` slightly in the future of the server's clock.
 */
export const FRESH_AUTH_CLOCK_SKEW_SEC = 60;

/**
 * `details.reason` on the `failed-precondition` error `deleteAccount` throws
 * when the sign-in is too old. The app reauthenticates and retries on it.
 */
export const REAUTH_REQUIRED_REASON = 'requires-recent-login';

/**
 * The request a client sends to `deleteAccount`. `reauth: true` says the
 * client can reauthenticate, and only such a call is held to the fresh-auth
 * window; installed binaries that predate it send no data and keep the old
 * path until `minSupported` passes the first version that sends it.
 */
export interface DeleteAccountRequest {
  reauth?: boolean;
}
