import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { censoAnswersDoc } from '@cultuvilla/shared/firebase/refs/admin';

const db = admin.firestore();

/**
 * A villager's census answers belong to their membership: when the membership
 * ends — leaving, removal by an admin, account deletion — the private
 * censoAnswers doc goes with it. One trigger covers every path that deletes a
 * member doc, client batch or Admin SDK alike.
 */
export const purgeMemberCensoAnswers = onDocumentDeleted(
  { document: 'municipalities/{municipalityId}/members/{userId}', region: 'us-central1' },
  async (event) => {
    const { municipalityId, userId } = event.params;
    const ref = censoAnswersDoc(db, municipalityId, userId);
    const snap = await ref.get();
    if (!snap.exists) return;
    await ref.delete();
    logger.info('censoAnswers purged with membership', {
      handler: 'purgeMemberCensoAnswers',
      municipalityId,
      userId,
    });
  },
);
