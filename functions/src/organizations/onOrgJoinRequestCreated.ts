import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  organizationDoc,
  organizationMembersCollection,
  userDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { notifyOrgJoinRequestCreated } from '../helpers/notifyRequests';

const db = admin.firestore();

/**
 * Tells an `approval` org's admins that someone asked to join, so the request
 * doesn't sit unseen until one of them happens to open the Buzón.
 */
export const onOrgJoinRequestCreated = onDocumentCreated(
  { document: 'organizations/{orgId}/joinRequests/{userId}', region: 'us-central1' },
  async (event) => {
    const handler = 'onOrgJoinRequestCreated';
    const { orgId, userId } = event.params;

    const [orgSnap, adminsSnap, requesterSnap] = await Promise.all([
      organizationDoc(db, orgId).get(),
      organizationMembersCollection(db, orgId).where('role', '==', 'admin').get(),
      // The raw doc, not the typed one: only the name is needed, and a
      // requester's doc may still be the trigger-created stub.
      db.doc(userDoc(db, userId).path).get(),
    ]);
    const org = orgSnap.data();
    if (!org) {
      logger.warn('join request for a missing org', { handler, orgId, userId });
      return;
    }
    const name: unknown = requesterSnap.get('displayName');

    await notifyOrgJoinRequestCreated({
      orgId,
      orgName: org.name,
      municipalityId: org.municipalityId,
      requesterUid: userId,
      requesterName: typeof name === 'string' && name.trim() ? name.trim() : 'Alguien',
      adminUids: adminsSnap.docs.map((d) => d.id),
    });
    logger.info('org join request announced to admins', {
      handler,
      orgId,
      userId,
      admins: adminsSnap.size,
    });
  },
);
