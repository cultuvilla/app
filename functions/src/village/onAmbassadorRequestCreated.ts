import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { municipalityDoc } from '@cultuvilla/shared/firebase/refs/admin';
import { ambassadorLeadAlert, organizerRequestAlert } from '../notify/ambassadorAlerts';
import { publishNotify } from '../notify/publishNotify';
import { defineDocumentTrigger } from '../shared/define/defineDocumentTrigger';

const db = admin.firestore();

/**
 * Tells the founders on Telegram that someone asked to be a pueblo's Embajador,
 * so a request doesn't sit unseen until a super admin opens the Buzón. Only the
 * pueblo travels; who asked is read behind the message's link (see
 * ../notify/ambassadorAlerts.ts).
 *
 * Both triggers retry a failed publish (the gateway dedupes on the doc id), but
 * only for an hour: past that the alert is stale and the Buzón has it anyway.
 */
const RETRY_WINDOW_MS = 60 * 60 * 1000;

const tooOld = (eventTime: string): boolean => Date.now() - Date.parse(eventTime) > RETRY_WINDOW_MS;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const onOrganizerRequestCreated = defineDocumentTrigger(
  'onOrganizerRequestCreated',
  { kind: 'created', document: 'organizerRequests/{requestId}', retry: true },
  async (event) => {
    const handler = 'onOrganizerRequestCreated';
    const { requestId } = event.params;
    if (tooOld(event.time)) {
      logger.warn('organizer request alert dropped after retry window', { handler, requestId });
      return;
    }
    const request = event.data?.data();
    if (!request) return;
    const municipalityId = text(request['municipalityId']);
    // Raw doc, not the typed one: only the pueblo's name is needed.
    const muniSnap = municipalityId ? await db.doc(municipalityDoc(db, municipalityId).path).get() : null;

    await publishNotify(
      organizerRequestAlert({
        projectId: process.env['GCLOUD_PROJECT'],
        requestId,
        municipalityName: text(muniSnap?.get('name')),
        province: text(muniSnap?.get('province')),
      }),
    );
    logger.info('organizer request announced', { handler, requestId, municipalityId });
  },
);

export const onAmbassadorLeadCreated = defineDocumentTrigger(
  'onAmbassadorLeadCreated',
  { kind: 'created', document: 'ambassadorLeads/{leadId}', retry: true },
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
        municipalityName: text(lead['municipalityName']) ?? 'pueblo desconocido',
        matched: text(lead['municipalityId']) !== null,
      }),
    );
    // No name or phone in the log: the lead is personal data.
    logger.info('ambassador lead announced', { handler, leadId });
  },
);
