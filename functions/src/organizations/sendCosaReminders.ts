import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { cosaRequestDoc, cosaRequestsCollection, organizationDoc, userNotificationsCollection } from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildNotificationData,
  cosaOverdueRecipients,
  EVENT_TZ,
  isCosaRequestOverdue,
  madridDayKey,
  type CosaRequestData,
} from '@cultuvilla/shared/models';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { cosaManagerUids } from './onCosaRequestWritten';

const db = getFirestore();
const handler = 'sendCosaReminders';

export interface CosaReminderRunResult {
  overdueCount: number;
  notificationCount: number;
}

export function cosaOverdueCopy(
  to: 'holder' | 'manager',
  req: Pick<CosaRequestData, 'cosaTitle' | 'untilOn' | 'requesterName'>,
  orgName: string,
): { title: string; body: string } {
  const what = `«${req.cosaTitle}»`;
  const day = req.untilOn ? formatDayKey(req.untilOn, 'long') : '';
  return to === 'holder'
    ? { title: `Toca devolver · ${orgName}`, body: `${what} tenía que volver el ${day}. Si ya lo has devuelto, avisa en la solicitud.` }
    : { title: `No ha vuelto · ${orgName}`, body: `${req.requesterName} tiene ${what} desde antes del ${day}. Cuando vuelva, márcalo como devuelto.` };
}

/**
 * Stamps `overdueNotifiedOn` on a request still lent and not nudged yet, and
 * says whether this run won it. Recorded before sending, so an overlapping or
 * retried run nudges nobody twice; a send that then fails is logged and not retried.
 */
async function claim(firestore: Firestore, requestId: string, today: string): Promise<CosaRequestData | null> {
  return firestore.runTransaction(async (tx) => {
    const ref = cosaRequestDoc(firestore, requestId);
    const req = (await tx.get(ref)).data();
    if (!req || req.overdueNotifiedOn !== null || !isCosaRequestOverdue(req, today)) return null;
    tx.update(ref.withConverter(null), { overdueNotifiedOn: today });
    return req;
  });
}

/** Every lent cosa past its `untilOn` and not nudged yet. Exported for the handler tests. */
export async function runCosaReminders(firestore: Firestore, now: Date): Promise<CosaReminderRunResult> {
  const result: CosaReminderRunResult = { overdueCount: 0, notificationCount: 0 };
  const today = madridDayKey(now);
  const snap = await cosaRequestsCollection(firestore)
    .where('status', '==', 'lent')
    .where('overdueNotifiedOn', '==', null)
    .where('untilOn', '<', today)
    .get();

  const orgNames = new Map<string, string>();
  for (const doc of snap.docs) {
    try {
      const req = await claim(firestore, doc.id, today);
      if (!req) continue;
      result.overdueCount += 1;
      if (!orgNames.has(req.orgId)) orgNames.set(req.orgId, (await organizationDoc(firestore, req.orgId).get()).data()?.name ?? '');
      const orgName = orgNames.get(req.orgId) ?? '';
      const { holder, managers } = cosaOverdueRecipients(req, await cosaManagerUids(firestore, req));
      const sends: { uid: string; to: 'holder' | 'manager' }[] = [
        { uid: holder, to: 'holder' },
        ...managers.map((uid) => ({ uid, to: 'manager' as const })),
      ];
      for (const s of sends) {
        const copy = cosaOverdueCopy(s.to, req, orgName);
        await userNotificationsCollection(firestore, s.uid)
          .doc(`cosa_${doc.id}_overdue`)
          .set(
            buildNotificationData({
              type: 'group_task',
              title: copy.title,
              body: copy.body,
              municipalityId: req.municipalityId,
              requesterUid: req.requesterUid,
              entityKind: 'organization',
              entityId: req.orgId,
              cosaRequestId: doc.id,
              createdAt: now,
            }),
          );
        result.notificationCount += 1;
      }
    } catch (err) {
      // One bad request must not cost every other its nudge.
      logger.error('Cosa overdue reminder failed', { handler, requestId: doc.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/**
 * The overdue nudge for the cosateca: the day after a lent cosa was due back,
 * once, to whoever holds it and to its managers. Daily at 10:00 Madrid, like
 * the task reminders, so it never lands in quiet hours.
 */
export const sendCosaReminders = onSchedule({ schedule: 'every day 10:00', timeZone: EVENT_TZ }, async () => {
  const result = await runCosaReminders(db, new Date());
  logger.info('Cosa reminders run', { handler, ...result });
});
