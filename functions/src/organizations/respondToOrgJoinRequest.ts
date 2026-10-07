import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityMemberDoc,
  organizationDoc,
  organizationJoinRequestDoc,
  organizationMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildOrgMemberData } from '@cultuvilla/shared/models';
import { writeMembershipEvent } from '../helpers/membershipAudit';
import { notifyOrgJoinRequestResolved } from '../helpers/notifyRequests';

const db = getFirestore();

interface RespondToOrgJoinRequestData {
  orgId?: string;
  userId?: string;
  decision?: 'approved' | 'rejected';
}

interface RespondToOrgJoinRequestResult {
  ok: true;
}

/**
 * Resolve a request to join an org whose joinPolicy is `approval` — the only
 * way into such an org other than an admin adding someone directly.
 *
 * Authority mirrors the org-member create rule: an org admin, an admin of the
 * org's village, or an app admin. Approval adds the member and its
 * `membershipEvents` record in the same transaction that deletes the request;
 * the requester is notified either way once it commits.
 */
export const respondToOrgJoinRequest = onCall<
  RespondToOrgJoinRequestData,
  Promise<RespondToOrgJoinRequestResult>
>({ region: 'us-central1', cors: true }, async (request) => {
  const handler = 'respondToOrgJoinRequest';
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const { orgId, userId, decision } = request.data;
  if (!orgId || !userId || (decision !== 'approved' && decision !== 'rejected')) {
    throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
  }
  const callerUid = auth.uid;

  const { orgName, municipalityId } = await db.runTransaction(async (tx) => {
    const orgRef = organizationDoc(db, orgId);
    const requestRef = organizationJoinRequestDoc(db, orgId, userId);
    const targetMemberRef = organizationMemberDoc(db, orgId, userId);
    const [orgSnap, requestSnap, callerOrgSnap, appAdminSnap, targetSnap] = await Promise.all([
      tx.get(orgRef),
      tx.get(requestRef),
      tx.get(organizationMemberDoc(db, orgId, callerUid)),
      tx.get(adminDoc(db, callerUid)),
      tx.get(targetMemberRef),
    ]);

    const org = orgSnap.data();
    if (!org) throw new HttpsError('not-found', 'Organización no encontrada.');
    const callerVillageSnap = await tx.get(municipalityMemberDoc(db, org.municipalityId, callerUid));

    const authorized =
      appAdminSnap.exists
      || callerOrgSnap.data()?.role === 'admin'
      || callerVillageSnap.data()?.role === 'admin';
    if (!authorized) throw new HttpsError('permission-denied', 'No autorizado.');
    if (!requestSnap.exists) {
      throw new HttpsError('not-found', 'La solicitud ya no existe.');
    }

    tx.delete(requestRef);
    if (decision === 'approved' && !targetSnap.exists) {
      tx.set(targetMemberRef, buildOrgMemberData({ userId, role: 'member' }));
      writeMembershipEvent(tx, db, {
        scopeType: 'org',
        scopeId: orgId,
        municipalityId: org.municipalityId,
        actorUserId: callerUid,
        targetUserId: userId,
        action: 'added',
        fromRole: null,
        toRole: 'member',
      });
    }
    return { orgName: org.name, municipalityId: org.municipalityId };
  });

  await notifyOrgJoinRequestResolved({
    orgId,
    orgName,
    municipalityId,
    requesterUid: userId,
    decision,
  });
  logger.info('org join request resolved', { handler, callerUid, orgId, userId, decision });
  return { ok: true };
});
