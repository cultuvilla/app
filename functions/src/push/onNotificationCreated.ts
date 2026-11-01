import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  pushQueueDoc,
  userGroupPrefsDoc,
  userNotificationPrefsDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationDataSchema,
  allowsPush,
  buildPushQueueData,
  notificationCategory,
  pushQueueId,
  resolveSendTime,
  type NotificationData,
} from '@cultuvilla/shared/models';
import { deliverPush } from './deliverPush';
import { APNS_AUTH_KEY } from './secret';

const db = getFirestore();

/**
 * The single seam between the notification log and the device.
 *
 * Every producer in the codebase writes a notification doc and nothing else;
 * this is what turns those docs into pushes. Adding a producer therefore costs
 * nothing — it gets push for free — and no producer can forget to send one,
 * which is exactly what a `notify()` helper called from seven places could not
 * guarantee.
 *
 * `onDocumentCreated`, not `onWrite`: several producers use deterministic ids
 * so a redelivered Eventarc event overwrites rather than duplicates. An
 * overwrite fires *update*, so that dedup keeps working and a re-run of, say,
 * `signups_disabled_${eventId}` cannot buzz the same pocket twice.
 */
export const onNotificationCreated = onDocumentCreated(
  { document: 'users/{userId}/notifications/{notifId}', secrets: [APNS_AUTH_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { userId, notifId } = event.params;

    // Trigger snapshots are NOT converter-wrapped, so the raw data carries
    // Timestamps where the model expects Dates. Only `createdAt` matters here
    // and the push never renders it, so normalize that one field rather than
    // dragging the whole normalizer in.
    const raw = snap.data();
    const createdAt = (raw['createdAt'] as { toDate?: () => Date } | undefined)?.toDate?.()
      ?? new Date();
    const parsed = NotificationDataSchema.safeParse({ ...raw, createdAt });
    if (!parsed.success) {
      logger.error('Notification does not match the schema; no push sent', {
        handler: 'onNotificationCreated',
        userId,
        notificationId: notifId,
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }
    const notification: NotificationData = parsed.data;
    const category = notificationCategory(notification.type);

    const prefsSnap = await userNotificationPrefsDoc(db, userId).get();
    const prefs = prefsSnap.data() ?? DEFAULT_NOTIFICATION_PREFS;

    if (!allowsPush(prefs, category)) {
      // The in-app Buzón still has it — muting a category suppresses the buzz,
      // never the record.
      logger.info('Push suppressed by preference', {
        handler: 'onNotificationCreated',
        userId,
        notificationId: notifId,
        type: notification.type,
        category,
      });
      return;
    }

    // A group message is muted per group, never as a category. A chat message
    // has its own switch, `chatPush`, which decided whether this doc exists at all.
    if (category === 'groups' && notification.entityId && !notification.chatThreadId) {
      const groupPrefs = (await userGroupPrefsDoc(db, userId, notification.entityId).get()).data();
      if (groupPrefs?.messagesMuted) {
        logger.info('Push suppressed by group mute', {
          handler: 'onNotificationCreated',
          userId,
          notificationId: notifId,
          orgId: notification.entityId,
        });
        return;
      }
    }

    const now = new Date();
    const sendAfter = resolveSendTime({
      category,
      quietHoursEnabled: prefs.quietHours,
      now,
    });

    const queueRef = pushQueueDoc(db, pushQueueId(userId, notifId));
    try {
      // `create`, not `set`: it throws if the doc exists, which is precisely the
      // at-least-once guard. See PushQueueDataModel.
      await queueRef.create(
        buildPushQueueData({
          userId,
          notificationId: notifId,
          category,
          sendAfter,
          createdAt: now,
        }),
      );
    } catch {
      logger.info('Push already enqueued; redelivery ignored', {
        handler: 'onNotificationCreated',
        userId,
        notificationId: notifId,
      });
      return;
    }

    if (sendAfter.getTime() > now.getTime()) {
      logger.info('Push deferred to the end of quiet hours', {
        handler: 'onNotificationCreated',
        userId,
        notificationId: notifId,
        category,
        sendAfter: sendAfter.toISOString(),
      });
      return;
    }

    const result = await deliverPush(userId, notifId, notification);
    await queueRef.update({
      sentAt: new Date(),
      deliveredCount: result.delivered,
      failedCount: result.failed,
    });
  },
);
