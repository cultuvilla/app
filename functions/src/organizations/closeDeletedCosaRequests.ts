import type { Firestore } from 'firebase-admin/firestore';
import { cosaRequestsCollection, cosaSlotsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { OPEN_COSA_REQUEST_STATUSES, type CosaRequestStatus } from '@cultuvilla/shared/models';

/** gRPC NOT_FOUND: the request went with its requester's account meanwhile. */
function isNotFound(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && (reason as { code?: unknown }).code === 5;
}

/**
 * A deleted cosa's open requests have nothing left to move them: a pending or
 * accepted one can never be handed over, and a colectivizado one out with
 * someone has no next holder to pass to. Close them all — an unanswered one as
 * declined (its requester is told it is gone), one out on loan as returned,
 * since there is no cosa left to track — and drop the reserva slot locks, which
 * would otherwise outlive the cosa as a subcollection.
 *
 * Returns how many requests it closed.
 */
export async function closeDeletedCosaRequests(firestore: Firestore, cosaId: string, now: Date): Promise<number> {
  const open = await cosaRequestsCollection(firestore)
    .where('cosaId', '==', cosaId)
    .where('status', 'in', [...OPEN_COSA_REQUEST_STATUSES])
    .get();
  const writes = open.docs.map((d) => {
    const req = d.data();
    const status: CosaRequestStatus = req.status === 'lent' ? 'returned' : 'declined';
    // Unconverted: a partial update of the function-owned fields.
    return d.ref.withConverter(null).update({
      status,
      closedAt: now,
      ...(req.respondedAt === null ? { respondedAt: now } : {}),
    });
  });
  const slots = await cosaSlotsCollection(firestore, cosaId).get();
  // Settled, not all-or-nothing: a request deleted meanwhile (its requester's
  // account going at the same time) must not stop the others from closing.
  const results = await Promise.allSettled([...writes, ...slots.docs.map((s) => s.ref.delete())]);
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => r.reason as unknown)
    .filter((reason) => !isNotFound(reason));
  if (failed.length > 0) throw new Error(`${String(failed.length)} writes for a deleted cosa failed: ${failed.map(String).join('; ')}`);
  return open.size;
}
