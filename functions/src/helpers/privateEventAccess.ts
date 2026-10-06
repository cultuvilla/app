import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { organizationDoc, organizationMemberDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { isPrivateEvent } from '@cultuvilla/shared/models';
import type { EventData } from '@cultuvilla/shared/models';

type PrivacyFields = Pick<EventData, 'visibility' | 'visibilityOrgId' | 'organizerUserIds'>;

/**
 * Sign-up gate for an event restricted to one organization.
 *
 * firestore.rules already hide a private event from non-members, but every
 * registration is written by a callable through the Admin SDK, which bypasses
 * rules entirely — so without this the event id alone (a forwarded share link,
 * a seat-claim URL) would be enough for an outsider to take a seat at an event
 * they cannot even see. The event's own organizers are exempt: they may not be
 * members of the org they are organizing for.
 */
export async function assertMayJoinEvent(
  db: Firestore,
  tx: Transaction,
  event: PrivacyFields,
  userId: string,
): Promise<void> {
  if (!isPrivateEvent(event)) return;
  if (event.organizerUserIds.includes(userId)) return;
  const orgId = event.visibilityOrgId;
  if (orgId === null) return;
  // Only an `approval` org's membership is vetted; anyone can join an open one.
  // Mirrors isVettedOrgMember in firestore.rules. Read raw: a converter parse
  // of the whole org would fail this gate on unrelated schema drift.
  const [orgSnap, memberSnap] = await Promise.all([
    tx.get(db.doc(organizationDoc(db, orgId).path)),
    tx.get(organizationMemberDoc(db, orgId, userId)),
  ]);
  const vetted = orgSnap.get('joinPolicy') === 'approval';
  if (!vetted || !memberSnap.exists) {
    throw new HttpsError(
      'permission-denied',
      'Este evento es privado: solo pueden apuntarse los miembros de la organización.',
    );
  }
}
