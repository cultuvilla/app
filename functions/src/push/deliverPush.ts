import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import {
  municipalityDoc,
  userDevicesCollection,
  userNotificationsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  buildPushEnvelope,
  toApnsNotification,
  toFcmAndroidMessage,
  type NotificationData,
} from '@cultuvilla/shared/models';
import { mayPushToUser } from '../shared/deliveryAudience';
import { sendApns } from './apnsTransport';
import { sendFcmAndroid } from './fcmTransport';
import type { TransportTarget } from './transport';

const db = getFirestore();

export interface DeliverResult {
  delivered: number;
  failed: number;
}

/**
 * Sends one notification to every device the user has registered, each over
 * its own platform's transport, and prunes the tokens either platform rejects
 * as permanently dead.
 *
 * Best-effort by design: the notification doc is the durable record, and a
 * push that never arrives must not fail the trigger that wrote it.
 */
export async function deliverPush(
  userId: string,
  notificationId: string,
  notification: NotificationData,
): Promise<DeliverResult> {
  const devices = await userDevicesCollection(db, userId).get();
  if (devices.empty) return { delivered: 0, failed: 0 };

  // Outside production only people with an account in this project's Auth get
  // a push: a token copied or seeded from elsewhere belongs to a real phone.
  const allowed = await mayPushToUser(userId, {
    handler: 'deliverPush',
    channel: 'push',
    fields: { notificationId, type: notification.type, deviceCount: devices.size },
  });
  if (!allowed) return { delivered: 0, failed: 0 };

  const android: string[] = [];
  const ios: TransportTarget[] = [];
  for (const d of devices.docs) {
    const data = d.data();
    if (data.platform === 'ios') {
      ios.push({ token: d.id, apnsEnvironment: data.apnsEnvironment, apnsTopic: data.apnsTopic });
    } else {
      android.push(d.id);
    }
  }

  // The tap route is village-first, and a notification holds the municipality
  // id, not its slug. Slugs never change, so the read is the only cost.
  const municipality = notification.municipalityId
    ? await municipalityDoc(db, notification.municipalityId).get()
    : null;
  const envelope = buildPushEnvelope(
    notificationId,
    notification,
    municipality?.data()?.slug ?? null,
  );

  // The icon badge has to be the unread count the Buzón would show — not the
  // number of pushes sent, which drifts the moment one is read elsewhere. Only
  // iOS renders it, so only pay for the count when there is an iOS device.
  let badge: number | undefined;
  if (ios.length > 0) {
    const unread = await userNotificationsCollection(db, userId)
      .where('read', '==', false)
      .count()
      .get();
    badge = unread.data().count;
  }

  const [androidResult, iosResult] = await Promise.all([
    sendFcmAndroid(toFcmAndroidMessage(envelope, android)),
    sendApns(ios, toApnsNotification(envelope, badge === undefined ? {} : { badge })),
  ]);

  const dead = [...androidResult.deadTokens, ...iosResult.deadTokens];
  if (dead.length > 0) {
    const batch = db.batch();
    for (const token of dead) batch.delete(userDevicesCollection(db, userId).doc(token));
    await batch.commit();
  }

  const delivered = androidResult.delivered + iosResult.delivered;
  const failed = androidResult.failed + iosResult.failed;

  logger.info('Push delivered', {
    handler: 'deliverPush',
    userId,
    notificationId,
    type: notification.type,
    category: envelope.category,
    androidCount: android.length,
    iosCount: ios.length,
    delivered,
    failed,
    prunedTokens: dead.length,
  });

  return { delivered, failed };
}
