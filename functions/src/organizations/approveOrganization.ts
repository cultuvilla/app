import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityMemberDoc,
  organizationDoc,
  organizationMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildOrgMemberData } from '@cultuvilla/shared/models';
import { writeMembershipEvent } from '../helpers/membershipAudit';

const db = getFirestore();

interface ApproveOrganizationData {
  orgId?: string;
}

interface ApproveOrganizationResult {
  ok: true;
}

/**
 * Approve a pending organization: flip its status and seed the requester
 * (`requestedBy`) as the founding admin — in one audited transaction. Approval
 * moved server-side (from the old client `approveOrganization`) so the admin
 * seed is function-owned and recorded in `membershipEvents`; firestore.rules
 * now forbids a client from setting `status: 'approved'` directly.
 *
 * Authority: a village admin of the org's municipality, or an app admin
 * (mirrors the old client rule). Rejection stays a client write (no membership
 * change to audit).
 */
export const approveOrganization = onCall<
  ApproveOrganizationData,
  Promise<ApproveOrganizationResult>
>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'approveOrganization';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { orgId } = request.data;
    if (!orgId) throw new HttpsError('invalid-argument', 'orgId requerido.');

    const callerUid = auth.uid;

    await db.runTransaction(async (tx) => {
      const orgRef = organizationDoc(db, orgId);
      const appAdminRef = adminDoc(db, callerUid);
      // All reads before any write.
      const [orgSnap, appAdminSnap] = await Promise.all([tx.get(orgRef), tx.get(appAdminRef)]);
      if (!orgSnap.exists) throw new HttpsError('not-found', 'Organización no encontrada.');
      const org = orgSnap.data();
      if (!org) throw new HttpsError('not-found', 'Organización no encontrada.');
      const { municipalityId, requestedBy } = org;
      if (!municipalityId || !requestedBy) {
        throw new HttpsError('failed-precondition', 'Organización incompleta.');
      }

      const isAppAdmin = appAdminSnap.exists;
      let isVillageAdmin = false;
      if (!isAppAdmin) {
        const callerVillageMember = await tx.get(municipalityMemberDoc(db, municipalityId, callerUid));
        isVillageAdmin = callerVillageMember.exists && callerVillageMember.data()?.role === 'admin';
      }
      if (!isAppAdmin && !isVillageAdmin) {
        throw new HttpsError('permission-denied', 'No autorizado.');
      }

      if (org.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'La organización ya fue revisada.');
      }

      // tx.update bypasses the converter — serverTimestamp() is fine.
      tx.update(orgRef, {
        status: 'approved',
        // Every group starts out requiring acceptance, and installed binaries
        // still create orgs as `open`.
        joinPolicy: 'approval',
        reviewedBy: callerUid,
        reviewedAt: FieldValue.serverTimestamp(),
      });
      // Seed the requester as the founding admin.
      tx.set(organizationMemberDoc(db, orgId, requestedBy), buildOrgMemberData({ userId: requestedBy, role: 'admin' }));
      writeMembershipEvent(tx, db, {
        scopeType: 'org',
        scopeId: orgId,
        municipalityId,
        actorUserId: callerUid,
        targetUserId: requestedBy,
        action: 'added',
        toRole: 'admin',
      });
    });

    logger.info('organization approved', { handler, callerUid, orgId });
    return { ok: true };
  },
);
