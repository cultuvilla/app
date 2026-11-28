import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { municipalityDoc, municipalityMembersCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { notifyOrgPresenceRequestCreated, storedName } from '../helpers/notifyRequests';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = admin.firestore();

/**
 * Tells the asked pueblo's Equipo that a group from elsewhere wants to be listed
 * there, so the request doesn't sit unseen until one of them opens the Buzón.
 */
export const onOrgPresenceRequestCreated = defineDocumentTrigger(
  'onOrgPresenceRequestCreated',
  { kind: 'created', document: 'organizations/{orgId}/presenceRequests/{municipalityId}' },
  async (event) => {
    const handler = 'onOrgPresenceRequestCreated';
    const { orgId, municipalityId } = event.params;
    const orgName: unknown = event.data?.get('orgName');
    const requestedBy: unknown = event.data?.get('requestedBy');
    if (typeof orgName !== 'string' || typeof requestedBy !== 'string') {
      logger.warn('presence request without its group name or requester', { handler, orgId, municipalityId });
      return;
    }

    const [villageSnap, adminsSnap] = await Promise.all([
      // Raw: only the name is needed, and it must not fail on a doc the converter would refuse.
      db.doc(municipalityDoc(db, municipalityId).path).get(),
      municipalityMembersCollection(db, municipalityId).where('role', '==', 'admin').get(),
    ]);

    await notifyOrgPresenceRequestCreated({
      orgId,
      orgName,
      municipalityId,
      municipalityName: storedName(villageSnap.get('name'), 'tu pueblo'),
      requesterUid: requestedBy,
      adminUids: adminsSnap.docs.map((d) => d.id),
    });
    logger.info('org presence request announced to the pueblo', {
      handler,
      orgId,
      municipalityId,
      admins: adminsSnap.size,
    });
  },
);
