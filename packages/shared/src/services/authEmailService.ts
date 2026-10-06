// packages/shared/src/services/authEmailService.ts
import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';

/**
 * Sends the branded Cultuvilla re-authentication email-link for `email`, via
 * the `sendAuthSignInEmail` callable (Admin SDK link generation + Resend
 * delivery — see functions/src/auth/sendAuthSignInEmail.ts). Used only by
 * changeEmail's re-auth step — sign-in itself uses sendAuthOtpCode/
 * verifyAuthOtpCode below, since reauthenticateWithCredential requires a real
 * Firebase-issued email-link credential that an OTP code can't provide.
 * `continueUrl` is the client-built redirect target (mirrors AuthContext's
 * getEmailLinkContinueUrl()); the Admin SDK can't derive it server-side.
 */
export async function sendAuthSignInEmail(email: string, continueUrl: string): Promise<void> {
  const fn = httpsCallable<{ email: string; continueUrl: string }, { ok: true }>(
    getFirebaseFunctions(),
    'sendAuthSignInEmail',
  );
  await fn({ email, continueUrl });
}

/**
 * Requests a 6-digit sign-in code be emailed to `email` (10 min expiry, 5
 * wrong-attempt lockout — see functions/src/auth/sendAuthOtpCode.ts). Pair
 * with verifyAuthOtpCode to complete sign-in.
 */
export async function sendAuthOtpCode(email: string): Promise<void> {
  const fn = httpsCallable<{ email: string }, { ok: true }>(
    getFirebaseFunctions(),
    'sendAuthOtpCode',
  );
  await fn({ email });
}

/**
 * Verifies a code sent by sendAuthOtpCode and returns a Firebase custom token
 * for signInWithCustomToken — see functions/src/auth/verifyAuthOtpCode.ts.
 */
export async function verifyAuthOtpCode(email: string, code: string): Promise<string> {
  const fn = httpsCallable<{ email: string; code: string }, { token: string }>(
    getFirebaseFunctions(),
    'verifyAuthOtpCode',
  );
  const result = await fn({ email, code });
  return result.data.token;
}
