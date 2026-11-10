import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { organizationDoc, cosaRequestsCollection, userNotificationsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import { buildNotificationData, reservaReminderWindow } from '@cultuvilla/shared/models';
import { reservaWhen } from './onCosaRequestWritten';

/**
 * About an hour before a confirmed booking ("tu pista es a las 18:00"), to its
 * booker. Not a scheduler of its own: `sendEventReminders` already runs every
 * hour and calls this, and the window (30 to 90 minutes out) puts each booking
 * in exactly one run. The fixed id is created, never overwritten, so a retried
 * run cannot buzz twice.
 */
export async function sendReservaReminders(firestore: Firestore, now: Date): Promise<number> {
  const { from, to } = reservaReminderWindow(now);
  const due = await cosaRequestsCollection(firestore)
    .where('cosaKind', '==', 'reserva')
    .where('status', '==', 'accepted')
    .where('startAt', '>=', Timestamp.fromDate(from))
    .where('startAt', '<', Timestamp.fromDate(to))
    .get();
  if (due.empty) return 0;

  const orgNames = new Map<string, string>();
  let sent = 0;
  for (const d of due.docs) {
    const req = d.data();
    if (!orgNames.has(req.orgId)) orgNames.set(req.orgId, (await organizationDoc(firestore, req.orgId).get()).data()?.name ?? '');
    const ref = userNotificationsCollection(firestore, req.requesterUid).doc(`cosa_${d.id}_reminder`);
    try {
      await ref.create(
        buildNotificationData({
          type: 'group_task',
          title: `Tienes reserva · ${orgNames.get(req.orgId) ?? ''}`,
          body: `«${req.cosaTitle}», ${reservaWhen(req)}.`,
          municipalityId: req.municipalityId,
          requesterUid: req.requesterUid,
          entityKind: 'organization',
          entityId: req.orgId,
          cosaRequestId: d.id,
          createdAt: now,
        }),
      );
      sent++;
    } catch (err) {
      // ALREADY_EXISTS: an earlier run sent it.
      if ((err as { code?: number }).code !== 6) throw err;
    }
  }
  return sent;
}
