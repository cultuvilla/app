import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ModeratedCollectionSchema,
  ModeratedCollection,
  buildModerationEventData,
} from '@cultuvilla/shared/models';
import { adminDoc, municipalityMemberDoc, moderationEventsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { defineCallable } from '../shared/define/defineCallable';

const db = admin.firestore();

// Collections nested under a municipality don't carry a `municipalityId`
// field of their own (it's implicit in the parent path), so the callable
// requires it in the request for those two; news/festivalPosters derive it
// from the target doc itself.
const NESTED_COLLECTIONS: ReadonlySet<ModeratedCollection> = new Set(['barrios', 'places']);

function buildPath(collection: ModeratedCollection, docId: string, municipalityId: string): string {
  switch (collection) {
    case 'news':
      return `news/${docId}`;
    case 'festivalPosters':
      return `festivalPosters/${docId}`;
    case 'barrios':
      return `municipalities/${municipalityId}/barrios/${docId}`;
    case 'places':
      return `municipalities/${municipalityId}/places/${docId}`;
    case 'vocabularyTerms':
      return `vocabularyTerms/${docId}`;
    case 'vocabularyDefinitions':
      return `vocabularyDefinitions/${docId}`;
    case 'historyEntries':
      return `historyEntries/${docId}`;
  }
}

interface SetContentVisibilityData {
  collection?: string;
  docId?: string;
  hidden?: boolean;
  reason?: string;
  // Required for barrios/places (see NESTED_COLLECTIONS above); ignored for
  // news/festivalPosters, whose municipalityId is derived from the doc.
  municipalityId?: string;
}

interface SetContentVisibilityResult {
  status: 'active' | 'hidden';
}

export const setContentVisibility = defineCallable<
  SetContentVisibilityData,
  Promise<SetContentVisibilityResult>
>('setContentVisibility', { cors: true }, async (request) => {
  const handler = 'setContentVisibility';
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const { docId, hidden, reason, municipalityId: inputMunicipalityId } = request.data;
  const parsedCollection = ModeratedCollectionSchema.safeParse(request.data.collection);

  if (!parsedCollection.success || typeof docId !== 'string' || !docId || typeof hidden !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Argumentos inválidos.');
  }
  const collection = parsedCollection.data;

  if (NESTED_COLLECTIONS.has(collection) && (typeof inputMunicipalityId !== 'string' || !inputMunicipalityId)) {
    throw new HttpsError('invalid-argument', 'municipalityId requerido.');
  }

  const targetRef = db.doc(buildPath(collection, docId, inputMunicipalityId ?? ''));

  const status = await db.runTransaction(async (tx) => {
    const snap = await tx.get(targetRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Contenido no encontrado.');

    const data = snap.data();
    if (!data) throw new HttpsError('not-found', 'Contenido no encontrado.');

    const municipalityId = NESTED_COLLECTIONS.has(collection)
      ? (inputMunicipalityId as string)
      : (data.municipalityId as string | undefined);
    if (!municipalityId) throw new HttpsError('not-found', 'Contenido no encontrado.');

    const callerMemberRef = municipalityMemberDoc(db, municipalityId, auth.uid);
    const appAdminRef = adminDoc(db, auth.uid);

    const [callerMemberSnap, appAdminSnap] = await Promise.all([
      tx.get(callerMemberRef),
      tx.get(appAdminRef),
    ]);

    const isVillageAdmin = callerMemberSnap.exists && callerMemberSnap.get('role') === 'admin';
    const isAppAdmin = appAdminSnap.exists;

    if (!isVillageAdmin && !isAppAdmin) {
      throw new HttpsError('permission-denied', 'No autorizado.');
    }

    const patch = hidden
      ? {
          status: 'hidden' as const,
          hiddenBy: auth.uid,
          hiddenAt: FieldValue.serverTimestamp(),
          hiddenReason: reason ?? null,
        }
      : {
          status: 'active' as const,
          hiddenBy: null,
          hiddenAt: null,
          hiddenReason: null,
        };
    tx.update(targetRef, patch);

    const eventRef = moderationEventsCollection(db).doc();
    tx.set(
      eventRef,
      buildModerationEventData({
        municipalityId,
        collection,
        docId,
        action: hidden ? 'hide' : 'unhide',
        actorUserId: auth.uid,
        reason: reason ?? null,
      }),
    );

    return patch.status;
  });

  logger.info('content visibility set', { handler, collection, docId, hidden });
  return { status };
});
