import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getAuth } from 'firebase-admin/auth';

interface RestoreLegacySessionData {
  refreshToken: string;
  apiKey: string;
}

type RestoreLegacySessionResult = { status: 'restored'; token: string } | { status: 'refused' };

const handler = 'restoreLegacySession';
const EXCHANGE_TIMEOUT_MS = 10_000;
// `auth_time` and `lastSignInTime` record the same sign-in from two services, so
// they differ by a moment. A later sign-in is one past this margin.
const SAME_SIGN_IN_MARGIN_MS = 5 * 60 * 1000;

function secureTokenUrl(apiKey: string): string {
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emulatorHost
    ? `http://${emulatorHost}/securetoken.googleapis.com`
    : 'https://securetoken.googleapis.com';
  return `${base}/v1/token?key=${encodeURIComponent(apiKey)}`;
}

/** The ID token the refresh token is good for, or null if Firebase rejects it. */
async function exchangeRefreshToken(refreshToken: string, apiKey: string): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(secureTokenUrl(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    });
  } catch {
    throw new HttpsError('unavailable', 'No se pudo comprobar la sesión.');
  }
  if (response.status >= 500) {
    throw new HttpsError('unavailable', 'No se pudo comprobar la sesión.');
  }
  if (!response.ok) return null;
  const body = (await response.json()) as { id_token?: unknown };
  return typeof body.id_token === 'string' ? body.id_token : null;
}

export function signedInSince(authTimeSeconds: number, lastSignInTime: string | undefined): boolean {
  const lastSignIn = Date.parse(lastSignInTime ?? '');
  return lastSignIn - authTimeSeconds * 1000 > SAME_SIGN_IN_MARGIN_MS;
}

/**
 * Moves a session from the JS SDK, which up to v1.5 kept it in AsyncStorage, to
 * the native SDK, which cannot read that or adopt a refresh token: the only way
 * in is a custom token. See docs/decisions/legacy-session-restore.md.
 *
 * It takes the refresh token rather than an ID token because a custom token is a
 * long-lived session: an ID token, valid for an hour and sent to every backend,
 * must not be enough to mint one. Whoever holds a refresh token has that session
 * already, so this grants nothing new.
 *
 * Refuses an account that has signed in since this session began. Those users
 * reached the native SDK, and a stale AsyncStorage entry must not sign back in
 * someone who has signed out there.
 */
export async function runRestoreLegacySession(
  data: RestoreLegacySessionData,
): Promise<RestoreLegacySessionResult> {
  const { refreshToken, apiKey } = data;
  if (typeof refreshToken !== 'string' || !refreshToken || typeof apiKey !== 'string' || !apiKey) {
    throw new HttpsError('invalid-argument', 'Sesión no válida.');
  }

  const idToken = await exchangeRefreshToken(refreshToken, apiKey);
  if (!idToken) {
    logger.info('legacy session refused', { handler, reason: 'exchange-rejected' });
    return { status: 'refused' };
  }

  const auth = getAuth();
  let uid: string;
  let authTime: number;
  try {
    // Also rejects a token from another project: the API key is the caller's.
    const decoded = await auth.verifyIdToken(idToken, true);
    uid = decoded.uid;
    authTime = decoded.auth_time;
  } catch {
    logger.info('legacy session refused', { handler, reason: 'token-rejected' });
    return { status: 'refused' };
  }

  const user = await auth.getUser(uid);
  if (signedInSince(authTime, user.metadata.lastSignInTime)) {
    logger.info('legacy session refused', { handler, uid, reason: 'signed-in-since' });
    return { status: 'refused' };
  }

  const token = await auth.createCustomToken(uid);
  logger.info('legacy session restored', { handler, uid });
  return { status: 'restored', token };
}

export const restoreLegacySession = onCall<
  RestoreLegacySessionData,
  Promise<RestoreLegacySessionResult>
>(
  { region: 'us-central1', cors: true },
  // Unauthenticated by design: the caller has no native session yet.
  async (request) => runRestoreLegacySession(request.data),
);
