import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  organizationDoc,
  organizationMemberDoc,
  organizationSocioPersonaLockDoc,
  organizationSocioPrivateDoc,
  organizationSociosCollection,
  userDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildSocioData,
  buildSocioPrivateData,
  hasSocioRoster,
  requiresSocioContact,
  socioContactMissing,
  type SocioContactRequirement,
} from '@cultuvilla/shared/models';

const db = getFirestore();

export type RosterOutcome = 'alta' | 'adopted' | 'unchanged' | 'baja';

/**
 * Brings the member's socio rows in line with their CURRENT membership, read
 * in the same transaction — never with what the triggering event claims.
 * Firestore delivers trigger events at least once and in no guaranteed order,
 * so a join can arrive after the leave that followed it, or a leave after the
 * rejoin. Reconciling against the member doc makes every delivery converge:
 *
 * - Not a member: their active row and the personas they answer for get the
 *   baja (and the personas' locks go).
 * - A member: the row of THIS membership is the one whose `memberJoinedAt`
 *   matches the member doc's `joinedAt`. An active row of an earlier
 *   membership (its leave was never applied) gets the baja at the rejoin
 *   date; if no row matches, the member's own persona row is adopted (keeping
 *   its alta) or a new row opens. A member who is no longer an admin loses
 *   their title.
 *
 * A new member of a group that requires contact data accepted that on the way
 * in, so their row opens with it, from their account. Should something be
 * missing, the app asks them when they open the group.
 */
export async function reconcileSocioMembership(
  firestore: Firestore,
  orgId: string,
  uid: string,
  requirement: SocioContactRequirement = { socioPhoneRequired: false, socioEmailRequired: false },
): Promise<RosterOutcome> {
  const socios = organizationSociosCollection(firestore, orgId);
  const user = (await userDoc(firestore, uid).get()).data();
  const personId = user?.personId ?? null;
  const contact = requiresSocioContact(requirement)
    ? buildSocioPrivateData({
        phone: requirement.socioPhoneRequired ? user?.telephone : null,
        email: requirement.socioEmailRequired ? user?.email : null,
        consentAnsweredAt: new Date(),
      })
    : null;
  const shareable = contact && !socioContactMissing(requirement, contact) ? contact : null;

  return firestore.runTransaction(async (tx) => {
    const [member, own, personas, adoptable] = await Promise.all([
      tx.get(organizationMemberDoc(firestore, orgId, uid)),
      tx.get(socios.where('uid', '==', uid).where('bajaAt', '==', null)),
      tx.get(socios.where('responsibleUid', '==', uid).where('bajaAt', '==', null)),
      personId
        ? tx.get(socios.where('personId', '==', personId).where('kind', '==', 'persona').where('bajaAt', '==', null))
        : Promise.resolve(null),
    ]);
    const membership = member.data();

    if (!membership) {
      const rows = [...own.docs, ...personas.docs];
      const locks = await Promise.all(
        personas.docs.map((row) => {
          const pid = row.data().personId;
          return pid ? tx.get(organizationSocioPersonaLockDoc(firestore, orgId, pid)) : Promise.resolve(null);
        }),
      );
      for (const row of rows) tx.update(row.ref, { bajaAt: FieldValue.serverTimestamp() });
      locks.forEach((lock, i) => {
        if (lock?.exists && lock.data()?.socioId === personas.docs[i]?.id) tx.delete(lock.ref);
      });
      return rows.length > 0 ? 'baja' : 'unchanged';
    }

    const joinedAt = membership.joinedAt;
    const isCurrent = (row: (typeof own.docs)[number]) =>
      row.data().memberJoinedAt?.getTime() === joinedAt.getTime();
    const current = own.docs.find(isCurrent);
    for (const stale of own.docs.filter((row) => !isCurrent(row))) {
      tx.update(stale.ref, { bajaAt: joinedAt });
    }

    if (current) {
      if (membership.role !== 'admin' && current.data().adminTitle !== null) {
        tx.update(current.ref, { adminTitle: null });
      }
      return 'unchanged';
    }

    const persona = adoptable && !adoptable.empty ? adoptable.docs[0] : undefined;
    if (persona && personId) {
      tx.update(persona.ref, { kind: 'member', uid, responsibleUid: null, memberJoinedAt: joinedAt });
      tx.delete(organizationSocioPersonaLockDoc(firestore, orgId, personId));
      if (shareable) tx.set(organizationSocioPrivateDoc(firestore, orgId, persona.id), shareable);
      return 'adopted';
    }

    const row = socios.doc();
    if (shareable) tx.set(organizationSocioPrivateDoc(firestore, orgId, row.id), shareable);
    tx.set(
      row,
      buildSocioData({
        kind: 'member',
        displayName: user?.displayName ?? '',
        uid,
        personId,
        altaAt: joinedAt,
        memberJoinedAt: joinedAt,
        createdBy: uid,
      }),
    );
    return 'alta';
  });
}

/**
 * Keeps `organizations/{orgId}/socios` in step with the org's members: joining
 * is the alta, leaving the baja (the row stays — it is the libro de socios), and
 * losing the admin role drops the display title. Every event — create, delete,
 * role change, a retry, a late delivery — runs the same reconcile against the
 * member doc as it is now. The ayuntamiento keeps no roster. A write under an
 * org that is already gone (the delete cascade) is a no-op, so it does not
 * recreate the org's subcollection.
 */
export const syncOrgSocioRoster = onDocumentWritten(
  { document: 'organizations/{orgId}/members/{userId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncOrgSocioRoster';
    const { orgId, userId } = event.params;
    const org = (await organizationDoc(db, orgId).get()).data();
    if (!org || !hasSocioRoster(org.type)) return;

    // The event says only that this membership changed; what it changed to is
    // read fresh inside the reconcile (see reconcileSocioMembership).
    const outcome = await reconcileSocioMembership(db, orgId, userId, org);
    logger.info('socio roster reconciled', { handler, orgId, userId, outcome });
  },
);
