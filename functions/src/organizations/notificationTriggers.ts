import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { userNotificationsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData } from '@cultuvilla/shared/models';
import { broadcastToVillage } from '../village/entityPublishedTriggers';
import { syncCosaAudience } from './syncCosaAudience';

const db = getFirestore();

// Also keeps the group's cosas on its cosateca audience (syncCosaAudience) —
// folded in here rather than a second trigger on the same document.
//
// Fires for BOTH approval (callable) and rejection (client write) so the
// org_approved/org_rejected notifications land uniformly regardless of which
// path flipped the status. Snapshots are raw DocumentData (not converter-wrapped).
export const onOrganizationUpdated = onDocumentUpdated(
  'organizations/{orgId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const rewritten = await syncCosaAudience(db, event.params.orgId, before, after);
    if (rewritten > 0) {
      logger.info('Cosa audience synced', { handler: 'onOrganizationUpdated', orgId: event.params.orgId, rewritten });
    }

    const beforeStatus = before['status'] as string | undefined;
    const afterStatus = after['status'] as string | undefined;
    const requestedBy = after['requestedBy'] as string | undefined;
    const municipalityId = (after['municipalityId'] as string | undefined) ?? null;
    const orgName = (after['name'] as string | undefined) ?? '';
    if (!requestedBy) return;
    if (beforeStatus !== 'pending') return;

    let type: 'org_approved' | 'org_rejected';
    let title: string;
    let body: string;
    if (afterStatus === 'approved') {
      type = 'org_approved';
      title = 'Organización aprobada';
      body = `Tu organización "${orgName}" fue aprobada.`;
    } else if (afterStatus === 'rejected') {
      type = 'org_rejected';
      title = 'Organización rechazada';
      body = `Tu organización "${orgName}" fue rechazada.`;
    } else {
      return;
    }

    const ref = userNotificationsCollection(db, requestedBy).doc();
    await ref.set(buildNotificationData({ type, title, body, municipalityId }));

    // Approval is also the moment the org becomes visible to the village —
    // creation was only a request. Broadcast here rather than from a second
    // trigger on the same transition (see docs/decisions/unified-inbox.md:
    // org lifecycle outcomes extend this handler). The founder is excluded;
    // they just got their own org_approved above.
    if (type === 'org_approved' && municipalityId) {
      await broadcastToVillage({
        kind: 'organization',
        entityId: event.params.orgId,
        municipalityId,
        entityLabel: orgName || null,
        actorUid: requestedBy,
        handler: 'onOrganizationUpdated',
      });
    }
  },
);
