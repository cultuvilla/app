import { createHash } from 'crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Pre-auth/global rate limiting has no municipality to scope by, so this is
// one of the few top-level collections that doesn't carry a `municipalityId`
// (AGENTS.md §3 is about domain entities; this is infrastructure).
const RATE_LIMIT_COLLECTION = 'authEmailRateLimits';
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_SENDS = 5;
// Per caller IP, across every address it asks for. Looser than the per-email
// cap because a whole village can sit behind one NAT'd connection.
export const IP_RATE_LIMIT_MAX_SENDS = 30;

export function bucketIdFor(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

export function ipBucketIdFor(ip: string): string {
  return `ip_${createHash('sha256').update(ip).digest('hex')}`;
}

interface CallerRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * The client's IP behind Google's front end: the first `x-forwarded-for` hop,
 * falling back to the socket address. Null when neither is present (unit
 * callers), which skips the per-IP bucket rather than sharing one.
 */
export function callerIpOf(req: CallerRequest | undefined): string | null {
  const header = req?.headers?.['x-forwarded-for'];
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
  return first || req?.ip || null;
}

/**
 * Both buckets for an unauthenticated send: the caller's IP first (so a
 * refused IP doesn't spend the address's allowance), then the address.
 */
export async function checkSendRateLimits(
  emailBucketId: string,
  callerIp: string | null,
): Promise<boolean> {
  if (callerIp && !(await checkRateLimit(ipBucketIdFor(callerIp), IP_RATE_LIMIT_MAX_SENDS))) {
    return false;
  }
  return checkRateLimit(emailBucketId);
}

/**
 * Atomically check-and-increment the fixed-window counter for `bucketId`.
 * Returns true when the send should proceed, false when the caller is over
 * the window's limit (in which case the send must be skipped, not the
 * response — callers should still return a generic {ok:true}).
 */
export async function checkRateLimit(
  bucketId: string,
  maxSends: number = RATE_LIMIT_MAX_SENDS,
): Promise<boolean> {
  const db = getFirestore();
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(bucketId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    if (!snap.exists) {
      tx.set(ref, { count: 1, windowStart: now });
      return true;
    }
    const data = snap.data() as { count: number; windowStart: Timestamp };
    const windowAgeMs = now.toMillis() - data.windowStart.toMillis();
    if (windowAgeMs > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { count: 1, windowStart: now });
      return true;
    }
    if (data.count >= maxSends) {
      return false;
    }
    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}
