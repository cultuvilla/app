import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const db = admin.firestore();

interface ResidenceLink {
  municipalityId: string;
  barrioId: string | null;
}

/**
 * Cleans an ex-member's residence link when their membership is deleted by a
 * *privileged* party — a village admin removing a member, or the admin SDK.
 * That actor cannot write another user's `persons` doc client-side (the persons
 * rule only lets a user edit their own), so this cleanup has to run server-side.
 *
 * Barrio residency otherwise lives ONLY in `persons.municipalityLinks`, written
 * directly by the owner (join / change-barrio client batches) and by the
 * server-side membership creations. This delete trigger is the single
 * remaining server-privileged write — the create/upsert projection it used to do
 * is gone.
 *
 * Self-leave (owner deletes their own membership) also fires this, but the client
 * batch already removed the link, so the filter is a no-op and the idempotency
 * guard skips the write.
 */
export const syncMemberBarrioToResidence = onDocumentDeleted(
  { document: 'municipalities/{municipalityId}/members/{userId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncMemberBarrioToResidence';
    const { municipalityId, userId } = event.params;

    // The person linked to this account. No person → nothing to clean up.
    const personSnap = await db
      .collection('persons')
      .where('userId', '==', userId)
      .limit(1)
      .get();
    if (personSnap.empty) {
      logger.info('No linked person; skipping residence cleanup', {
        handler,
        municipalityId,
        userId,
      });
      return;
    }
    const personRef = personSnap.docs[0].ref;
    const person = personSnap.docs[0].data();

    const current: ResidenceLink[] = Array.isArray(person['municipalityLinks'])
      ? (person['municipalityLinks'] as ResidenceLink[])
      : [];
    const next = current.filter((l) => l.municipalityId !== municipalityId);

    // Idempotency: nothing linked to this municipality (e.g. a self-leave batch
    // already removed it) → skip the write.
    if (current.length === next.length) return;

    await personRef.update({ municipalityLinks: next });
    logger.info('Residence link removed on membership delete', {
      handler,
      municipalityId,
      userId,
      personId: personRef.id,
    });
  },
);
