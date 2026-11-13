import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import {
  pushQueueDoc,
  userGroupPrefsDoc,
  userNotificationPrefsDoc,
  userNotificationSettingsDoc,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  NotificationDataSchema,
  NotificationSettingsDataSchema,
  allowsTopicPush,
  buildPushQueueData,
  notificationCategory,
  notificationTopic,
  resolveNotificationSettings,
  pushQueueId,
  resolveSendTime,
  type NotificationData,
  type NotificationSettingsData,
} from '@cultuvilla/shared/models';
import { deliverPush } from './deliverPush';
import { APNS_AUTH_KEY } from './secret';

const db = getFirestore();

/**
 * The per-topic switches, read raw: rules cannot check a list's items, so a
 * client could store a doc the strict converter rejects, and that must cost the
 * owner their switches, not every push they are sent. Absent or malformed reads
 * as "nothing muted" here.
 */
function parseSettings(userId: string, snap: DocumentSnapshot): NotificationSettingsData | null {
  if (!snap.exists) return null;
  const raw: Record<string, unknown> = snap.data() ?? {};
  const stamp = raw['updatedAt'];
  const updatedAt = stamp instanceof Timestamp ? stamp.toDate() : stamp;
  const parsed = NotificationSettingsDataSchema.safeParse({ ...raw, updatedAt });
  if (parsed.success) return parsed.data;
  logger.warn('Notification settings do not match the schema; ignored', {
    handler: 'onNotificationCreated',
    userId,
    issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  });
  return null;
}

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
    const topic = notificationTopic(notification);

    const [legacySnap, settingsSnap] = await Promise.all([
      userNotificationPrefsDoc(db, userId).get(),
      userNotificationSettingsDoc(db, userId).withConverter(null).get(),
    ]);
    const settings = resolveNotificationSettings(legacySnap.data() ?? null, parseSettings(userId, settingsSnap));

    if (!allowsTopicPush(settings, topic, notification.municipalityId)) {
      // The in-app Buzón still has it — muting a topic suppresses the buzz,
      // never the record.
      logger.info('Push suppressed by preference', {
        handler: 'onNotificationCreated',
        userId,
        notificationId: notifId,
        type: notification.type,
        category,
        topic,
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
      quietHoursEnabled: settings.quietHours,
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
