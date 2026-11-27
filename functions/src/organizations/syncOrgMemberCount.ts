import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { organizationDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { isNotFound } from '../interaction/syncEntityInteractionCounts';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = getFirestore();

/**
 * Keeps `organizations/{orgId}.memberCount` in step with the org's members
 * subcollection. A member doc create is +1, a delete is -1; role changes
 * (before and after both exist) are a no-op. The count powers the village hub's
 * "order peñas/agrupaciones by size" without an N+1 count-aggregate fan-out.
 *
 * Uses the field-path `.update()` overload so the org converter isn't invoked
 * for this partial write, and swallows NOT_FOUND so deleting a whole org (which
 * cascades its member docs) doesn't retry forever against the gone parent.
 */
export const syncOrgMemberCount = defineDocumentTrigger(
  'syncOrgMemberCount',
  { kind: 'written', document: 'organizations/{orgId}/members/{userId}' },
  async (event) => {
    const handler = 'syncOrgMemberCount';
    const existedBefore = event.data?.before.exists ?? false;
    const existsAfter = event.data?.after.exists ?? false;

    let delta = 0;
    if (!existedBefore && existsAfter) delta = 1;
    else if (existedBefore && !existsAfter) delta = -1;
    if (delta === 0) return;

    const { orgId } = event.params;
    try {
      await organizationDoc(db, orgId).update('memberCount', FieldValue.increment(delta));
    } catch (err) {
      if (isNotFound(err)) return; // org deleted before the cascade trigger ran → no-op
      throw err;
    }

    logger.info('org member count updated', { handler, orgId, delta });
  },
);
