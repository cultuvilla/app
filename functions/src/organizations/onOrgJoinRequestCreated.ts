import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  organizationDoc,
  organizationFollowerDoc,
  organizationMembersCollection,
  userDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { buildOrgFollowerData } from '@cultuvilla/shared/models';
import { notifyOrgJoinRequestCreated } from '../helpers/notifyRequests';

const db = admin.firestore();

/** gRPC ALREADY_EXISTS: a `create()` on a doc that is already there. */
const ALREADY_EXISTS = 6;

/**
 * Tells an org's admins that someone asked to join, so the request doesn't sit
 * unseen until one of them happens to open the Buzón. Asking also follows the
 * group: the requester sees its public life while they wait, and keeps following
 * if they are turned away.
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
    try {
      await organizationFollowerDoc(db, orgId, userId).create(
        buildOrgFollowerData({ userId, orgId, municipalityId: org.municipalityId }),
      );
    } catch (err) {
      if ((err as { code?: unknown }).code !== ALREADY_EXISTS) throw err;
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
