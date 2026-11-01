import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  organizationDoc,
  organizationMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { writeMembershipEvent } from '../helpers/membershipAudit';

const db = getFirestore();

interface ChangeOrgMemberRoleData {
  orgId?: string;
  targetUserId?: string;
  role?: 'admin' | 'member';
}

interface ChangeOrgMemberRoleResult {
  ok: true;
}

/**
 * Promote/demote an organization member's role — the single audited path for
 * making (or unmaking) an org admin. Clients can no longer write `role`
 * directly (firestore.rules makes it function-owned).
 *
 * Authority: an org admin of `orgId`, or an app admin. The role change and its
 * `membershipEvents` audit record commit in one transaction. The event is
 * scoped to the org's `municipalityId` so the village-admin activity feed picks
 * it up alongside village events.
 */
export const changeOrgMemberRole = onCall<
  ChangeOrgMemberRoleData,
  Promise<ChangeOrgMemberRoleResult>
>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'changeOrgMemberRole';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { orgId, targetUserId, role } = request.data;
    if (!orgId || !targetUserId || (role !== 'admin' && role !== 'member')) {
      throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    }

    const callerUid = auth.uid;

    await db.runTransaction(async (tx) => {
      const callerMemberRef = organizationMemberDoc(db, orgId, callerUid);
      const targetMemberRef = organizationMemberDoc(db, orgId, targetUserId);
      const appAdminRef = adminDoc(db, callerUid);
      const orgRef = organizationDoc(db, orgId);
      const [callerSnap, targetSnap, appAdminSnap, orgSnap] = await Promise.all([
        tx.get(callerMemberRef),
        tx.get(targetMemberRef),
        tx.get(appAdminRef),
        tx.get(orgRef),
      ]);

      const isAppAdmin = appAdminSnap.exists;
      const isOrgAdmin = callerSnap.exists && callerSnap.data()?.role === 'admin';
      if (!isAppAdmin && !isOrgAdmin) {
        throw new HttpsError('permission-denied', 'No autorizado.');
      }
      if (!orgSnap.exists) {
        throw new HttpsError('not-found', 'Organización no encontrada.');
      }
      if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'El usuario no es integrante de esta organización.');
      }

      const currentRole = targetSnap.data()?.role ?? null;
      if (currentRole === role) {
        return;
      }

      const municipalityId = orgSnap.data()?.municipalityId;
      if (!municipalityId) {
        throw new HttpsError('failed-precondition', 'La organización no tiene municipio.');
      }

      // tx.update bypasses the converter — a single-field patch is fine.
      tx.update(targetMemberRef, { role });
      writeMembershipEvent(tx, db, {
        scopeType: 'org',
        scopeId: orgId,
        municipalityId,
        actorUserId: callerUid,
        targetUserId,
        action: 'role_changed',
        fromRole: currentRole,
        toRole: role,
      });
    });

    logger.info('org member role changed', { handler, callerUid, orgId, targetUserId, role });
    return { ok: true };
  },
);
