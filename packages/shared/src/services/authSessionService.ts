// packages/shared/src/services/authSessionService.ts
import { getCallable } from './callableTransport';

export type LegacySessionResult = { status: 'restored'; token: string } | { status: 'refused' };

/**
 * Trades a JS SDK session's refresh token for a custom token the native SDK can
 * sign in with — see functions/src/auth/restoreLegacySession.ts.
 */
export async function restoreLegacySession(
  refreshToken: string,
  apiKey: string,
): Promise<LegacySessionResult> {
  const fn = getCallable<{ refreshToken: string; apiKey: string }, LegacySessionResult>('restoreLegacySession');
  const result = await fn({ refreshToken, apiKey });
  return result.data;
}
