import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityMemberDoc,
  organizationDoc,
  organizationMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface RemoveOrgPresenceData {
  orgId?: string;
  municipalityId?: string;
}

interface RemoveOrgPresenceResult {
  ok: true;
}

/**
 * Take a group out of a pueblo other than its home. Either side may: the
 * group's admins (leaving), that pueblo's Equipo (the one power accepting gave
 * it), or an app admin. The home pueblo never leaves `municipalityIds`.
 * See docs/decisions/multi-village-groups.md.
 */
export const removeOrgPresence = defineCallable<RemoveOrgPresenceData, Promise<RemoveOrgPresenceResult>>(
  'removeOrgPresence',
  { cors: true },
  async (request) => {
    const handler = 'removeOrgPresence';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { orgId, municipalityId } = request.data;
    if (!orgId || !municipalityId) throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
    const callerUid = auth.uid;

    await db.runTransaction(async (tx) => {
      const orgRef = organizationDoc(db, orgId);
      const [orgSnap, callerOrgSnap, callerVillageSnap, appAdminSnap] = await Promise.all([
        tx.get(orgRef),
        tx.get(organizationMemberDoc(db, orgId, callerUid)),
        tx.get(municipalityMemberDoc(db, municipalityId, callerUid)),
        tx.get(adminDoc(db, callerUid)),
      ]);
      const authorized =
        appAdminSnap.exists
        || callerOrgSnap.data()?.role === 'admin'
        || callerVillageSnap.data()?.role === 'admin';
      if (!authorized) throw new HttpsError('permission-denied', 'No autorizado.');

      const org = orgSnap.data();
      if (!org) throw new HttpsError('not-found', 'Organización no encontrada.');
      if (municipalityId === org.municipalityId) {
        throw new HttpsError('failed-precondition', 'Un grupo no puede dejar su propio pueblo.');
      }
      tx.update(orgRef, { municipalityIds: FieldValue.arrayRemove(municipalityId) });
    });

    logger.info('org presence removed', { handler, callerUid, orgId, municipalityId });
    return { ok: true };
  },
);
