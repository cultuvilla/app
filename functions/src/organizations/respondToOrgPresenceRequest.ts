import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityDoc,
  municipalityMemberDoc,
  organizationDoc,
  organizationMembersCollection,
  organizationPresenceRequestDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { canBeInSeveralVillages } from '@cultuvilla/shared/models';
import { notifyOrgPresenceRequestResolved, storedName } from '../helpers/notifyRequests';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface RespondToOrgPresenceRequestData {
  orgId?: string;
  municipalityId?: string;
  decision?: 'approved' | 'rejected';
}

interface RespondToOrgPresenceRequestResult {
  ok: true;
}

/**
 * Resolve a group's request to be listed in a pueblo other than its own — the
 * only way a pueblo joins a group's `municipalityIds`.
 *
 * Authority is the ASKED pueblo's: its Equipo (any village admin of it) or an
 * app admin. The group's own pueblo has no say here, and accepting grants the
 * asked pueblo nothing over the group but taking it out again (removeOrgPresence).
 * Acceptance adds the pueblo in the same transaction that deletes the request;
 * the group's admins are told either way once it commits.
 * See docs/decisions/multi-village-groups.md.
 */
export const respondToOrgPresenceRequest = defineCallable<
  RespondToOrgPresenceRequestData,
  Promise<RespondToOrgPresenceRequestResult>
>('respondToOrgPresenceRequest', { cors: true }, async (request) => {
  const handler = 'respondToOrgPresenceRequest';
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const { orgId, municipalityId, decision } = request.data;
  if (!orgId || !municipalityId || (decision !== 'approved' && decision !== 'rejected')) {
    throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
  }
  const callerUid = auth.uid;

  const orgName = await db.runTransaction(async (tx) => {
    const orgRef = organizationDoc(db, orgId);
    const requestRef = organizationPresenceRequestDoc(db, orgId, municipalityId);
    const [orgSnap, requestSnap, callerVillageSnap, appAdminSnap] = await Promise.all([
      tx.get(orgRef),
      tx.get(requestRef),
      tx.get(municipalityMemberDoc(db, municipalityId, callerUid)),
      tx.get(adminDoc(db, callerUid)),
    ]);

    if (!appAdminSnap.exists && callerVillageSnap.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'No autorizado.');
    }
    if (!requestSnap.exists) throw new HttpsError('not-found', 'La solicitud ya no existe.');
    const org = orgSnap.data();
    if (!org) throw new HttpsError('not-found', 'Organización no encontrada.');

    if (decision === 'approved') {
      if (org.status !== 'approved' || !canBeInSeveralVillages(org.type)) {
        throw new HttpsError('failed-precondition', 'Este grupo no puede estar en otros pueblos.');
      }
      if (municipalityId === org.municipalityId) {
        throw new HttpsError('failed-precondition', 'Es el pueblo del propio grupo.');
      }
      // arrayUnion keeps the home, which approval or the backfill put there.
      tx.update(orgRef, { municipalityIds: FieldValue.arrayUnion(municipalityId) });
    }
    tx.delete(requestRef);
    return org.name;
  });

  const [villageSnap, adminsSnap] = await Promise.all([
    // Raw: only the name is needed, and it must not fail on a doc the converter would refuse.
    db.doc(municipalityDoc(db, municipalityId).path).get(),
    organizationMembersCollection(db, orgId).where('role', '==', 'admin').get(),
  ]);
  await notifyOrgPresenceRequestResolved({
    orgId,
    orgName,
    municipalityId,
    municipalityName: storedName(villageSnap.get('name'), 'el pueblo'),
    adminUids: adminsSnap.docs.map((d) => d.id),
    decision,
  });
  logger.info('org presence request resolved', { handler, callerUid, orgId, municipalityId, decision });
  return { ok: true };
});
