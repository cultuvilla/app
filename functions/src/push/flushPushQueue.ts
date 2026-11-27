import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  pushQueueCollection,
  userNotificationDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import { NotificationDataSchema } from '@cultuvilla/shared/models';
import { deliverPush } from './deliverPush';
import { APNS_AUTH_KEY } from './secret';
import { defineSchedule } from '../shared/define/defineSchedule';

const db = getFirestore();

/**
 * Sends the pushes that quiet hours held overnight.
 *
 * Every 15 minutes rather than hourly: the whole queue comes due at 08:00
 * Madrid, and an hourly sweep would deliver "hay un evento nuevo" at up to
 * 08:59 — late enough to miss the morning it was held for.
 */
const BATCH_LIMIT = 200;

export const flushPushQueue = defineSchedule(
  'flushPushQueue',
  { schedule: 'every 15 minutes', secrets: [APNS_AUTH_KEY] },
  async () => {
  const now = new Date();
  const due = await pushQueueCollection(db)
    .where('sentAt', '==', null)
    .where('sendAfter', '<=', now)
    .limit(BATCH_LIMIT)
    .get();

  if (due.empty) return;

  let sent = 0;
  let missing = 0;

  for (const entry of due.docs) {
    const { userId, notificationId } = entry.data();
    const notifSnap = await userNotificationDoc(db, userId, notificationId).get();

    if (!notifSnap.exists) {
      // The user deleted their account (or the notification) while it waited.
      // Retiring the entry rather than retrying forever is the point of the
      // sentAt stamp — this queue has no dead-letter to inspect.
      missing += 1;
      await entry.ref.update({ sentAt: now, deliveredCount: 0, failedCount: 0 });
      continue;
    }

    const parsed = NotificationDataSchema.safeParse(notifSnap.data());
    if (!parsed.success) {
      missing += 1;
      await entry.ref.update({ sentAt: now, deliveredCount: 0, failedCount: 0 });
      continue;
    }

    const result = await deliverPush(userId, notificationId, parsed.data);
    await entry.ref.update({
      sentAt: new Date(),
      deliveredCount: result.delivered,
      failedCount: result.failed,
    });
    sent += 1;
  }

  logger.info('Flushed deferred pushes', {
    handler: 'flushPushQueue',
    dueCount: due.size,
    sentCount: sent,
    retiredCount: missing,
    reachedLimit: due.size === BATCH_LIMIT,
  });
  },
);
