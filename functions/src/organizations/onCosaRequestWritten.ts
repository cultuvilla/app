import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  organizationDoc,
  organizationMembersCollection,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildNotificationData,
  CosaRequestDataSchema,
  EVENT_TZ,
  type CosaRequestData,
  type CosaRequestStatus,
} from '@cultuvilla/shared/models';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';

const db = getFirestore();

/** Which moves anyone is told about, and who: the manager hears of a new or cancelled request, the requester of the answer. */
type CosaNotice = 'created' | Extract<CosaRequestStatus, 'accepted' | 'declined' | 'given' | 'cancelled'>;

function dates(req: Pick<CosaRequestData, 'fromOn' | 'untilOn'>): string {
  if (req.fromOn && req.untilOn) return ` del ${formatDayKey(req.fromOn, 'long')} al ${formatDayKey(req.untilOn, 'long')}`;
  if (req.fromOn) return ` desde el ${formatDayKey(req.fromOn, 'long')}`;
  if (req.untilOn) return ` hasta el ${formatDayKey(req.untilOn, 'long')}`;
  return '';
}

/** A booking's slot, Madrid time: "el 12 de noviembre de 2026 a las 18:00". */
export function reservaWhen(req: Pick<CosaRequestData, 'fromOn' | 'startAt'>): string {
  if (!req.fromOn || !req.startAt) return '';
  return `el ${formatDayKey(req.fromOn, 'long')} a las ${formatDate(req.startAt, 'time', EVENT_TZ)}`;
}

function reservaCopy(notice: CosaNotice, req: CosaRequestData, orgName: string, wasAccepted: boolean): { title: string; body: string } {
  const what = `«${req.cosaTitle}»`;
  const when = reservaWhen(req);
  switch (notice) {
    case 'created':
      return { title: `Reserva por aprobar · ${orgName}`, body: `${req.requesterName} quiere ${what} ${when}.` };
    case 'accepted':
      return { title: `Reserva confirmada · ${orgName}`, body: `${what}, ${when}. Te esperan.` };
    case 'declined':
      return wasAccepted
        ? { title: `Reserva anulada · ${orgName}`, body: `Se ha anulado tu reserva de ${what} ${when}.` }
        : { title: `Reserva no aceptada · ${orgName}`, body: `Esta vez no ha podido ser: ${what} ${when}.` };
    case 'cancelled':
      return { title: `Reserva cancelada · ${orgName}`, body: `${req.requesterName} ya no quiere ${what} ${when}.` };
    case 'given':
      return { title: orgName, body: what };
  }
}

export function cosaRequestCopy(
  notice: CosaNotice,
  req: CosaRequestData,
  orgName: string,
  wasAccepted = false,
): { title: string; body: string } {
  if (req.cosaKind === 'reserva') return reservaCopy(notice, req, orgName, wasAccepted);
  const what = `«${req.cosaTitle}»`;
  switch (notice) {
    case 'created':
      return {
        title: `Te piden algo · ${orgName}`,
        body: req.ownerUid === null
          ? `${req.requesterName} pide ${what}, del grupo${dates(req)}.`
          : `${req.requesterName} te pide ${what}${dates(req)}.`,
      };
    case 'accepted':
      return { title: `Solicitud aceptada · ${orgName}`, body: `Han aceptado tu solicitud de ${what}${dates(req)}.` };
    case 'declined':
      return { title: `Solicitud no aceptada · ${orgName}`, body: `Esta vez no ha podido ser: ${what}.` };
    case 'given':
      return { title: `Es tuyo · ${orgName}`, body: `Te han dado ${what}.` };
    case 'cancelled':
      return { title: `Solicitud cancelada · ${orgName}`, body: `${req.requesterName} ya no necesita ${what}.` };
  }
}

/** The notice a write calls for, or null. */
export function cosaNoticeFor(before: CosaRequestData | null, after: CosaRequestData | null): CosaNotice | null {
  if (!after) return null;
  if (!before) return after.status === 'pending' ? 'created' : null;
  if (before.status === after.status) return null;
  // A booker letting a confirmed slot go needs no one's answer: the slot is free again.
  if (after.cosaKind === 'reserva' && after.status === 'cancelled' && before.status === 'accepted') return null;
  switch (after.status) {
    case 'accepted':
    case 'declined':
    case 'given':
    case 'cancelled':
      return after.status;
    default:
      return null;
  }
}

/** Who answers a request: the cosa's owner, or for a group's cosa the group's admins. */
export async function cosaManagerUids(firestore: Firestore, req: Pick<CosaRequestData, 'ownerUid' | 'orgId'>): Promise<string[]> {
  if (req.ownerUid !== null) return [req.ownerUid];
  const admins = await organizationMembersCollection(firestore, req.orgId).where('role', '==', 'admin').get();
  return admins.docs.map((d) => d.id);
}

export async function notifyCosaRequest(
  firestore: Firestore,
  requestId: string,
  before: CosaRequestData | null,
  after: CosaRequestData | null,
  now: Date,
): Promise<number> {
  const notice = cosaNoticeFor(before, after);
  if (!notice || !after) return 0;
  const org = (await organizationDoc(firestore, after.orgId).get()).data();
  const orgName = org?.name ?? '';
  const toManagers = notice === 'created' || notice === 'cancelled';
  const recipients = (toManagers ? await cosaManagerUids(firestore, after) : [after.requesterUid]).filter(
    (uid) => !toManagers || uid !== after.requesterUid,
  );
  const copy = cosaRequestCopy(notice, after, orgName, before?.status === 'accepted');
  await Promise.all(
    recipients.map((uid) =>
      // A fixed id: a redelivered event rewrites the same notification.
      userNotificationsCollection(firestore, uid)
        .doc(`cosa_${requestId}_${notice}`)
        .set(
          buildNotificationData({
            type: 'group_task',
            title: copy.title,
            body: copy.body,
            municipalityId: after.municipalityId,
            requesterUid: after.requesterUid,
            entityKind: 'organization',
            entityId: after.orgId,
            cosaRequestId: requestId,
            createdAt: now,
          }),
        ),
    ),
  );
  return recipients.length;
}

/**
 * Trigger snapshots are not converter-wrapped: the request's Timestamps (all
 * top-level) become Dates before the strict schema reads them.
 */
function parse(snap: { exists: boolean; data(): Record<string, unknown> | undefined } | undefined): CosaRequestData | null {
  const raw = snap?.exists ? snap.data() : undefined;
  if (!raw) return null;
  const dated = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v instanceof Timestamp ? v.toDate() : v]),
  );
  const parsed = CosaRequestDataSchema.safeParse(dated);
  return parsed.success ? parsed.data : null;
}

export const onCosaRequestWritten = onDocumentWritten('cosaRequests/{requestId}', async (event) => {
  const handler = 'onCosaRequestWritten';
  const requestId = event.params.requestId;
  const before = parse(event.data?.before);
  const after = parse(event.data?.after);
  if (event.data?.after.exists && !after) {
    logger.warn('Cosa request does not parse; nothing sent', { handler, requestId });
    return;
  }
  const sent = await notifyCosaRequest(db, requestId, before, after, new Date());
  if (sent > 0) logger.info('Cosa request notified', { handler, requestId, status: after?.status, recipients: sent });
});
