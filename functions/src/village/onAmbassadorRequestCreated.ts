import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { municipalityDoc, userDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { ambassadorLeadAlert, organizerRequestAlert } from '../notify/ambassadorAlerts';
import { publishNotify } from '../notify/publishNotify';

const db = admin.firestore();

/**
 * Tells the founders on Telegram that someone asked to be a pueblo's Embajador,
 * so a request doesn't sit unseen until a super admin opens the Buzón.
 *
 * Both triggers retry a failed publish (the gateway dedupes on the doc id), but
 * only for an hour: past that the alert is stale and the Buzón has it anyway.
 */
const RETRY_WINDOW_MS = 60 * 60 * 1000;

const tooOld = (eventTime: string): boolean => Date.now() - Date.parse(eventTime) > RETRY_WINDOW_MS;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const onOrganizerRequestCreated = onDocumentCreated(
  { document: 'organizerRequests/{requestId}', region: 'us-central1', retry: true },
  async (event) => {
    const handler = 'onOrganizerRequestCreated';
    const { requestId } = event.params;
    if (tooOld(event.time)) {
      logger.warn('organizer request alert dropped after retry window', { handler, requestId });
      return;
    }
    const request = event.data?.data();
    if (!request) return;
    const userId = text(request['userId']);
    const municipalityId = text(request['municipalityId']);

    const [muniSnap, requesterSnap] = await Promise.all([
      // Raw docs, not the typed ones: only names are needed, and a requester's
      // doc may still be the trigger-created stub.
      municipalityId ? db.doc(municipalityDoc(db, municipalityId).path).get() : null,
      userId ? db.doc(userDoc(db, userId).path).get() : null,
    ]);

    await publishNotify(
      organizerRequestAlert({
        projectId: process.env['GCLOUD_PROJECT'],
        requestId,
        requesterName: text(requesterSnap?.get('displayName')),
        municipalityName: text(muniSnap?.get('name')),
        province: text(muniSnap?.get('province')),
        motivation: text(request['motivation']),
      }),
    );
    logger.info('organizer request announced', { handler, requestId, municipalityId });
  },
);

export const onAmbassadorLeadCreated = onDocumentCreated(
  { document: 'ambassadorLeads/{leadId}', region: 'us-central1', retry: true },
  async (event) => {
    const handler = 'onAmbassadorLeadCreated';
    const { leadId } = event.params;
    if (tooOld(event.time)) {
      logger.warn('ambassador lead alert dropped after retry window', { handler, leadId });
      return;
    }
    const lead = event.data?.data();
    if (!lead) return;

    await publishNotify(
      ambassadorLeadAlert({
        projectId: process.env['GCLOUD_PROJECT'],
        leadId,
        name: text(lead['name']) ?? 'Sin nombre',
        phone: text(lead['phone']) ?? 'sin teléfono',
        municipalityName: text(lead['municipalityName']) ?? 'pueblo desconocido',
        matched: text(lead['municipalityId']) !== null,
      }),
    );
    // No name or phone in the log: the lead is personal data.
    logger.info('ambassador lead announced', { handler, leadId });
  },
);
