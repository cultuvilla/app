import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  organizationCuotaAssignmentDoc,
  organizationCuotaPaymentsCollection,
  organizationMemberDoc,
  organizationSocioDoc,
  organizationSocioPrivateDoc,
  organizationSociosCollection,
} from '@cultuvilla/shared/firebase/refs/admin';

const db = getFirestore();

interface LinkSocioToMemberData {
  orgId?: unknown;
  socioId?: unknown;
  memberUid?: unknown;
}

/**
 * A socio an admin typed in has since joined with the app, so the roster holds
 * them twice: the typed row and the member row `syncOrgSocioRoster` made on
 * join. Merges them into the typed row, which becomes the member row and keeps
 * the earlier alta and the typed row's socio number. The duplicate is deleted — it is not a baja, nobody left.
 *
 * Contact data: the member's own answer, if they gave one, replaces what the
 * admin typed (it is theirs to give); otherwise the typed contact stays.
 *
 * Cuota: entries recorded against the deleted row move to the surviving one
 * (the only time a ledger entry is rewritten — it keeps its history, only the
 * row it points at changes), and so does its assignment unless the typed row
 * has its own.
 *
 * Authority: an admin of the org. Callable because it rewrites a function-owned
 * member row and deletes one, which no client may do.
 */
export const linkSocioToMember = onCall<LinkSocioToMemberData, Promise<{ ok: true }>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'linkSocioToMember';
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const { orgId, socioId, memberUid } = request.data;
    if (typeof orgId !== 'string' || typeof socioId !== 'string' || typeof memberUid !== 'string' || !orgId || !socioId || !memberUid) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }

    await db.runTransaction(async (tx) => {
      const [caller, member, typed, memberRows] = await Promise.all([
        tx.get(organizationMemberDoc(db, orgId, callerUid)),
        tx.get(organizationMemberDoc(db, orgId, memberUid)),
        tx.get(organizationSocioDoc(db, orgId, socioId)),
        tx.get(organizationSociosCollection(db, orgId).where('uid', '==', memberUid).where('bajaAt', '==', null)),
      ]);
      if (caller.data()?.role !== 'admin') throw new HttpsError('permission-denied', 'No autorizado.');
      const membership = member.data();
      if (!membership) throw new HttpsError('failed-precondition', 'Esa persona no es integrante del grupo.');
      const typedData = typed.data();
      if (!typedData || typedData.kind !== 'typed' || typedData.bajaAt !== null) {
        throw new HttpsError('failed-precondition', 'Solo se puede vincular un socio añadido a mano y en alta.');
      }

      const memberRow = memberRows.empty ? undefined : memberRows.docs[0];
      const memberData = memberRow?.data();
      const [memberPrivate, memberPayments, memberAssignment, typedAssignment] = memberRow
        ? await Promise.all([
            tx.get(organizationSocioPrivateDoc(db, orgId, memberRow.id)).then((snap) => snap.data()),
            tx.get(organizationCuotaPaymentsCollection(db, orgId).where('socioId', '==', memberRow.id)),
            tx.get(organizationCuotaAssignmentDoc(db, orgId, memberRow.id)),
            tx.get(organizationCuotaAssignmentDoc(db, orgId, socioId)),
          ])
        : [undefined, undefined, undefined, undefined];

      const altaAt =
        memberData && memberData.altaAt < typedData.altaAt ? memberData.altaAt : typedData.altaAt;
      // Unconverted ref: the typed UpdateData rejects the nullable fields.
      tx.update(typed.ref.withConverter(null), {
        kind: 'member',
        uid: memberUid,
        // The account's own name wins over the admin's typing: once the row is a
        // member row no client may edit its name.
        displayName: memberData?.displayName.trim() ? memberData.displayName : typedData.displayName,
        personId: memberData?.personId ?? null,
        adminTitle: memberData?.adminTitle ?? null,
        altaAt,
        // The number the group gave the typed-in socio is theirs from the paper
        // libro; the member row's (assigned on join) only fills a gap.
        socioNumber: typedData.socioNumber ?? memberData?.socioNumber ?? null,
        // Ties the row to this membership, so syncOrgSocioRoster treats it as
        // current even if it runs after the merge.
        memberJoinedAt: membership.joinedAt,
      });
      if (memberPrivate?.consentAnsweredAt) {
        tx.set(organizationSocioPrivateDoc(db, orgId, socioId), memberPrivate);
      }
      if (memberRow) {
        tx.delete(memberRow.ref);
        tx.delete(organizationSocioPrivateDoc(db, orgId, memberRow.id));
        for (const entry of memberPayments?.docs ?? []) tx.update(entry.ref, { socioId });
        const moved = memberAssignment?.data();
        if (moved && !typedAssignment?.exists) tx.set(organizationCuotaAssignmentDoc(db, orgId, socioId), moved);
        if (memberAssignment?.exists) tx.delete(memberAssignment.ref);
      }
    });

    logger.info('socio linked to member', { handler, callerUid, orgId, socioId, memberUid });
    return { ok: true };
  },
);
