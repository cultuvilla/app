import { z } from 'zod';

/**
 * The pending sign-in code for one email, at `authOtpCodes/{bucketId}` (the
 * same hash `authEmailRateLimits` uses). Written by `sendAuthOtpCode`, spent or
 * counted by `verifyAuthOtpCode`, deleted on a match. Server-only:
 * `firestore.rules` has no match for it, so every client is denied.
 */
export const AuthOtpCodeDataSchema = z.object({
  /** sha256 of the 6-digit code; the code itself is never stored. */
  codeHash: z.string(),
  expiresAt: z.date(),
  /** Wrong guesses so far; verification refuses at the cap. */
  attempts: z.number().int().nonnegative(),
  createdAt: z.date(),
  /** The plaintext code, only under the Functions emulator (E2E reads it). */
  emulatorCode: z.string().optional(),
});
export type AuthOtpCodeData = z.infer<typeof AuthOtpCodeDataSchema>;
