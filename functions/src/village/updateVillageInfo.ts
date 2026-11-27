import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  adminDoc,
  municipalityDoc,
  municipalityMemberDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { defineCallable } from '../shared/define/defineCallable';

const db = getFirestore();

interface UpdateVillageInfoData {
  municipalityId?: string;
  description?: string;
}

interface UpdateVillageInfoResult {
  ok: true;
}

/**
 * Edit a village's basic info (description). Authorization:
 * - While the community has **no organizer** (`community.organizerId === null`),
 *   ANY member may edit — the wiki phase.
 * - Once an organizer exists, only village admins (or app admins) may edit.
 * The predicate ("is the caller a member AND is there no organizer yet") can't
 * be expressed in Firestore rules without a collection scan, so it lives here.
 */
export const updateVillageInfo = defineCallable<UpdateVillageInfoData, Promise<UpdateVillageInfoResult>>(
  'updateVillageInfo',
  { cors: true },
  async (request) => {
    const handler = 'updateVillageInfo';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { municipalityId, description } = request.data;
    if (!municipalityId) {
      throw new HttpsError('invalid-argument', 'municipalityId requerido.');
    }

    const callerUid = auth.uid;
    const muniRef = municipalityDoc(db, municipalityId);
    const memberRef = municipalityMemberDoc(db, municipalityId, callerUid);
    const appAdminRef = adminDoc(db, callerUid);

    await db.runTransaction(async (tx) => {
      const [muniSnap, memberSnap, appAdminSnap] = await Promise.all([
        tx.get(muniRef),
        tx.get(memberRef),
        tx.get(appAdminRef),
      ]);
      if (!muniSnap.exists) throw new HttpsError('not-found', 'Pueblo no encontrado.');
      // Converter-wrapped: typed MunicipalityData.
      const muniData = muniSnap.data();
      if (muniData?.communityActive !== true) {
        throw new HttpsError('failed-precondition', 'La comunidad no está activa.');
      }

      const hasOrganizer = muniData.community?.organizerId != null;
      const memberData = memberSnap.data();
      const isMember = memberSnap.exists;
      const isAdmin = isMember && memberData?.role === 'admin';
      const isAppAdmin = appAdminSnap.exists;

      // Wiki phase: any member edits. Otherwise: only admins / app admins.
      const allowed = isAppAdmin || isAdmin || (!hasOrganizer && isMember);
      if (!allowed) throw new HttpsError('permission-denied', 'No autorizado.');

      const updates: Record<string, string> = {};
      if (description !== undefined) updates['community.description'] = description.trim();
      if (Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'Nada que actualizar.');
      }
      // tx.update with dotted paths bypasses the converter and touches only the
      // community basic-info fields — never organizerId or reference data.
      tx.update(muniRef, updates);
    });

    logger.info('village info updated', { handler, callerUid, municipalityId });
    return { ok: true };
  },
);
