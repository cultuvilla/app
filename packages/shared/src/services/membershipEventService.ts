import { getDocs, query, where, orderBy } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { membershipEventsCollection } from '../firebase/refs/client';
import type { MembershipEventData } from '../models/membership/MembershipEventDataModel';

export type MembershipEventWithId = MembershipEventData & { id: string };

/**
 * Membership/role audit events for a village, newest first. Readable by the
 * village's admins (and app admins) per firestore.rules; scoped by
 * `municipalityId`, so the feed includes events from orgs within the village.
 *
 * Reads only. Events are written exclusively by Cloud Function callables /
 * triggers via the admin SDK — there is no client write path.
 */
export async function getMembershipEvents(
  municipalityId: string,
): Promise<MembershipEventWithId[]> {
  const q = query(
    membershipEventsCollection(getDb()),
    where('municipalityId', '==', municipalityId),
    orderBy('at', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
