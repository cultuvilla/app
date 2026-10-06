import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  municipalityDoc,
  organizerRequestsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import type { OrganizerRequestData } from '@cultuvilla/shared';

const db = getFirestore();

interface RequestOrganizeVillageData {
  municipalityId?: string;
  description?: string;
  motivation?: string | null;
}

interface RequestOrganizeVillageResult {
  ok: true;
  requestId: string;
}

export const requestOrganizeVillage = onCall<
  RequestOrganizeVillageData,
  Promise<RequestOrganizeVillageResult>
>(
  { region: 'us-central1', cors: true },
  async (request) => {
    const handler = 'requestOrganizeVillage';
    const auth = request.auth;
    if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

    const { municipalityId, description, motivation } = request.data;
    if (!municipalityId) {
      throw new HttpsError('invalid-argument', 'municipalityId requerido.');
    }
    // Activation is decoupled from organizing: the village must already be
    // started (active). The description now comes from the start flow and the
    // wiki phase, so it is optional here (motivation is the payload).
    const trimmedDescription = (description ?? '').trim();

    const uid = auth.uid;
    const muniSnap = await municipalityDoc(db, municipalityId).get();
    if (!muniSnap.exists) throw new HttpsError('not-found', 'Pueblo no encontrado.');
    // Converter-wrapped: typed MunicipalityData.
    const muniData = muniSnap.data();
    if (muniData?.communityActive !== true) {
      throw new HttpsError('failed-precondition', 'Primero hay que iniciar el pueblo.');
    }
    if (muniData.community?.organizerId != null) {
      throw new HttpsError('already-exists', 'Este pueblo ya tiene embajador.');
    }

    const reqsCol = organizerRequestsCollection(db);
    const dup = await reqsCol
      .where('userId', '==', uid)
      .where('municipalityId', '==', municipalityId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!dup.empty) {
      throw new HttpsError('already-exists', 'Ya tienes una solicitud pendiente para este pueblo.');
    }

    const ref = reqsCol.doc();
    // Converter rejects FieldValue sentinels on set; requestedAt is a plain Date
    // (the admin SDK persists it as a Timestamp via the converter's toFirestore).
    const newRequest: OrganizerRequestData = {
      userId: uid,
      municipalityId,
      requestedAt: new Date(),
      status: 'pending',
      description: trimmedDescription,
      motivation: motivation ?? null,
      reviewedAt: null,
      reviewedBy: null,
    };
    await ref.set(newRequest);

    logger.info('organizer request created', { handler, uid, municipalityId, requestId: ref.id });
    return { ok: true, requestId: ref.id };
  },
);
