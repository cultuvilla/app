import { z } from 'zod';

/**
 * One fixed-window send counter, at `authEmailRateLimits/{bucketId}`.
 *
 * The bucket id is a hash of the email address, `ip_<hash>` for a caller IP,
 * or `studio_ip_<hash>` for web-studio pairings (functions/src/auth/rateLimit.ts).
 * Pre-auth infrastructure, so it carries no `municipalityId`. Server-only:
 * `firestore.rules` has no match for it, so every client is denied.
 */
export const AuthEmailRateLimitDataSchema = z.object({
  /** Sends counted in the current window. */
  count: z.number().int().nonnegative(),
  /** When the current window opened; a window older than the limit restarts at 1. */
  windowStart: z.date(),
});
export type AuthEmailRateLimitData = z.infer<typeof AuthEmailRateLimitDataSchema>;
