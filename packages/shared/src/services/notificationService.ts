import {
  addDoc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  writeBatch,
  getCountFromServer,
  updateDoc,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import {
  userNotificationsCollection,
  userNotificationDoc,
  userDeviceDoc,
  userDevicesCollection,
  userNotificationPrefsDoc,
} from '../firebase/refs/client';
import {
  buildNotificationData,
  buildDeviceTokenData,
  buildNotificationPrefsData,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationData,
  type NotificationDataInput,
  type DeviceTokenData,
  type DeviceTokenDataInput,
  type NotificationPrefsData,
  type NotificationPrefsDataInput,
} from '../models/notification';
import { observability } from './observability/observabilityService';

export async function getNotifications(
  userId: string,
  maxResults = 50,
): Promise<(NotificationData & { id: string })[]> {
  const q = query(
    userNotificationsCollection(getDb(), userId),
    orderBy('createdAt', 'desc'),
    limit(maxResults),
  );
  const snap = await getDocs(q);
  // The converter is strict, so a doc a client's schema predates (a `type`
  // added after the binary shipped) makes `.data()` throw. Mapping straight
  // over `docs` would take the whole Buzón down with it, and the ZodError —
  // a pretty-printed JSON array — used to surface as an undismissable modal.
  // One unreadable row is not worth the other forty-nine: drop it and report
  // it, so schema drift is loud to us and invisible to the villager.
  return snap.docs.flatMap((d) => {
    try {
      return [{ id: d.id, ...d.data() }];
    } catch (err) {
      observability.captureError(err, {
        operation: 'notifications:getNotifications',
        notificationId: d.id,
      });
      return [];
    }
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  const q = query(userNotificationsCollection(getDb(), userId), where('read', '==', false));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function createNotification(
  userId: string,
  input: NotificationDataInput,
): Promise<string> {
  // addDoc routes through the typed converter, so createdAt must be a plain
  // Date (serverTimestamp sentinels are rejected by the schema). The converter
  // re-marshals the Date to a Firestore Timestamp on write.
  const ref = await addDoc(
    userNotificationsCollection(getDb(), userId),
    buildNotificationData(input),
  );
  return ref.id;
}

export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  // updateDoc accepts partial shapes against the typed ref for trivial fields.
  await updateDoc(userNotificationDoc(getDb(), userId, notificationId), { read: true });
}

export async function markAllAsRead(userId: string): Promise<void> {
  const q = query(userNotificationsCollection(getDb(), userId), where('read', '==', false));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(getDb());
  snap.docs.forEach((d) => {
    batch.update(d.ref, { read: true });
  });
  await batch.commit();
}

// ============================================================================
// PUSH DEVICES
// ============================================================================

// Idempotent: the doc id is the token, so re-registering the same device on
// every launch refreshes lastSeenAt instead of adding a row.
export async function registerDevice(
  userId: string,
  input: DeviceTokenDataInput,
): Promise<void> {
  await setDoc(userDeviceDoc(getDb(), userId, input.token), buildDeviceTokenData(input));
}

// Call on sign-out. Only the CURRENT device's token is known to the client, so
// this deliberately removes one row rather than clearing the collection — the
// user's other phones must keep receiving.
export async function unregisterDevice(userId: string, token: string): Promise<void> {
  await deleteDoc(userDeviceDoc(getDb(), userId, token));
}

export async function getDevices(userId: string): Promise<DeviceTokenData[]> {
  const snap = await getDocs(userDevicesCollection(getDb(), userId));
  return snap.docs.map((d) => d.data());
}

// ============================================================================
// PUSH PREFERENCES
// ============================================================================

// Returns the defaults when the account has never saved preferences — the doc
// is genuinely optional (see NotificationPrefsDataModel), not missing data.
export async function getNotificationPrefs(userId: string): Promise<NotificationPrefsData> {
  const snap = await getDoc(userNotificationPrefsDoc(getDb(), userId));
  return snap.exists() ? snap.data() : DEFAULT_NOTIFICATION_PREFS;
}

// Full write, not a merge: the form always submits every toggle, and a partial
// update against a non-existent doc would be denied (see AGENTS/updateDoc note).
export async function saveNotificationPrefs(
  userId: string,
  input: NotificationPrefsDataInput,
): Promise<void> {
  await setDoc(userNotificationPrefsDoc(getDb(), userId), buildNotificationPrefsData(input));
}
