import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { organizationDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { isNotFound } from '../interaction/syncEntityInteractionCounts';

const db = getFirestore();

/**
 * Keeps `organizations/{orgId}.followerCount` in step with the org's followers
 * subcollection, like syncOrgMemberCount does for members. Who follows is
 * private, so the pueblo reads this count, never the subcollection.
 */
export const syncOrgFollowerCount = onDocumentWritten(
  { document: 'organizations/{orgId}/followers/{userId}', region: 'us-central1' },
  async (event) => {
    const handler = 'syncOrgFollowerCount';
    const existedBefore = event.data?.before.exists ?? false;
    const existsAfter = event.data?.after.exists ?? false;

    let delta = 0;
    if (!existedBefore && existsAfter) delta = 1;
    else if (existedBefore && !existsAfter) delta = -1;
    if (delta === 0) return;

    const { orgId } = event.params;
    try {
      await organizationDoc(db, orgId).update('followerCount', FieldValue.increment(delta));
    } catch (err) {
      if (isNotFound(err)) return; // org deleted before the cascade trigger ran → no-op
      throw err;
    }

    logger.info('org follower count updated', { handler, orgId, delta });
  },
);
