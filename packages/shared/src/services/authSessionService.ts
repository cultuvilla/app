// packages/shared/src/services/authSessionService.ts
import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';

export type LegacySessionResult = { status: 'restored'; token: string } | { status: 'refused' };

/**
 * Trades a JS SDK session's refresh token for a custom token the native SDK can
 * sign in with — see functions/src/auth/restoreLegacySession.ts.
 */
export async function restoreLegacySession(
  refreshToken: string,
  apiKey: string,
): Promise<LegacySessionResult> {
  const fn = httpsCallable<{ refreshToken: string; apiKey: string }, LegacySessionResult>(
    getFirebaseFunctions(),
    'restoreLegacySession',
  );
  const result = await fn({ refreshToken, apiKey });
  return result.data;
}
