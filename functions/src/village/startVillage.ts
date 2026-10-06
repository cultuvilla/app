import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import {
  getFirestore,
  FieldValue,
  type DocumentData,
  type UpdateData,
} from 'firebase-admin/firestore';
import { municipalityDoc, municipalityMemberDoc } from '@cultuvilla/shared/firebase/refs/admin';
import type { VillageMemberData } from '@cultuvilla/shared';
import { readResidenceTarget, upsertResidenceLink } from './residenceProjection';
import { seedVillageSettlements } from './seedVillageSettlements';

const db = getFirestore();

interface StartVillageData {
  municipalityId?: string;
  description?: string;
  /**
   * URL of an escudo the starter uploaded to Storage during activation. The
   * client can't write `escudoManualUrl` to the muni doc itself (admin-only
   * rule), so it's set here, server-side, in the activation transaction. Only
   * applied when the village has no escudo yet.
   */
  escudoManualUrl?: string;
}

interface StartVillageResult {
  ok: true;
}

/**
 * Self-service activation. A villager brings a dormant municipality's community
 * to life WITHOUT becoming its organizer: the community is created with
 * `organizerId: null` (wiki phase — any member can edit its basic info until an
 * organizer is granted), and the caller is added as a plain member. Becoming the
 * organizer is a separate, superadmin-approved step (requestOrganizeVillage).
 */
export const startVillage = onCall<StartVillageData, Promise<StartVillageResult>>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'startVillage';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { municipalityId, description, escudoManualUrl } = request.data;
    if (!municipalityId) {
      throw new HttpsError('invalid-argument', 'municipalityId requerido.');
    }

    const uid = auth.uid;
    const muniRef = municipalityDoc(db, municipalityId);
    const memberRef = municipalityMemberDoc(db, municipalityId, uid);

    const codigoINE = await db.runTransaction(async (tx) => {
      const muni = await tx.get(muniRef);
      if (!muni.exists) throw new HttpsError('not-found', 'Pueblo no encontrado.');
      // Converter-wrapped: typed MunicipalityData.
      const muniData = muni.data();
      if (muniData?.communityActive === true) {
        throw new HttpsError('failed-precondition', 'La comunidad ya está activa.');
      }

      // Residence link projection (read before any write): the starter becomes a
      // member, so they must appear in getPersonsByBarrio at whole-village level.
      const residenceTarget = await readResidenceTarget(tx, db, uid);

      // Only set the manual escudo when the village has none yet, so the
      // starter's optional upload can't clobber an existing crest.
      const trimmedEscudo = escudoManualUrl?.trim();
      const setEscudo = Boolean(trimmedEscudo) && muniData?.escudoManualUrl == null;

      // tx.update bypasses the converter, so the nested community object can
      // carry a FieldValue.serverTimestamp(); the loose UpdateData<DocumentData>
      // keeps that mixed shape typecheckable. Activation never touches location —
      // coordinates/locationLabel/mapZoom are set only via the admin-only edit path.
      const update: UpdateData<DocumentData> = {
        communityActive: true,
        community: {
          description: (description ?? '').trim(),
          organizerId: null,
          organizerSex: null,
          profileForm: null,
          fiestas: [],
          activatedAt: FieldValue.serverTimestamp(),
        },
      };
      if (setEscudo) update.escudoManualUrl = trimmedEscudo;
      tx.update(muniRef, update);

      // Converter rejects FieldValue sentinels on set; joinedAt is a plain Date.
      const newMember: VillageMemberData = {
        userId: uid,
        role: 'user',
        joinedAt: new Date(),
        profileAnswers: {},
        profileCompletedAt: null,
      };
      tx.set(memberRef, newMember);
      if (residenceTarget) upsertResidenceLink(tx, residenceTarget, municipalityId, null);
      // Returned rather than assigned to an outer binding: the seeding step
      // below needs it, and a closure assignment is invisible to control-flow
      // narrowing (the compiler would treat it as forever null).
      return muniData?.codigoINE ?? null;
    });

    logger.info('village started', { handler, uid, municipalityId });

    // Outside the transaction on purpose: the largest municipality has 829
    // settlements and a transaction caps at 500 writes, and a village must come
    // to life even if its seed is missing. seedVillageSettlements swallows and
    // logs its own failures for that reason.
    if (codigoINE) await seedVillageSettlements(db, municipalityId, codigoINE);

    return { ok: true };
  },
);
