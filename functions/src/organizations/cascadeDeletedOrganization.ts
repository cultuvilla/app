import type { Firestore } from 'firebase-admin/firestore';
import { organizationDoc, organizationMembersCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { writeMembershipEvent } from '../helpers/membershipAudit';

// Two writes per integrante (the delete and its audit event), under the 500-write transaction cap.
const MEMBERS_PER_TRANSACTION = 200;

export interface DeletedOrganizationCounts {
  membersRemoved: number;
}

/**
 * Clears what a deleted group owned. Firestore does not cascade a delete, and a
 * client cannot: integrantes, socios and the `membershipEvents` log are
 * function-written. Each integrante leaves with a `removed` audit event in the
 * same transaction; then everything else under the group (join requests,
 * socios, tasks, messages, chats, ledger…) goes in one recursive delete.
 *
 * `actorUserId` is whoever deleted the group, or '' when no user did (Admin
 * SDK, console).
 */
export async function cascadeDeletedOrganization(
  db: Firestore,
  orgId: string,
  municipalityId: string,
  actorUserId: string,
): Promise<DeletedOrganizationCounts | null> {
  // A group written again under the same id since is not deleted; leave it whole.
  if ((await organizationDoc(db, orgId).withConverter(null).get()).exists) return null;

  const members = await organizationMembersCollection(db, orgId).withConverter(null).get();

  for (let i = 0; i < members.docs.length; i += MEMBERS_PER_TRANSACTION) {
    const chunk = members.docs.slice(i, i + MEMBERS_PER_TRANSACTION);
    await db.runTransaction((tx) => {
      for (const member of chunk) {
        const role: unknown = member.data()['role'];
        tx.delete(member.ref);
        writeMembershipEvent(tx, db, {
          scopeType: 'org',
          scopeId: orgId,
          municipalityId,
          actorUserId,
          targetUserId: member.id,
          action: 'removed',
          fromRole: typeof role === 'string' ? role : null,
          toRole: null,
        });
      }
      return Promise.resolve();
    });
  }

  await db.recursiveDelete(organizationDoc(db, orgId));

  return { membersRemoved: members.size };
}
