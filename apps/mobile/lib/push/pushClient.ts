import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import {
  ANDROID_CHANNELS,
  NOTIFICATION_CATEGORIES,
  type ApnsEnvironment,
  type DeviceTokenDataInput,
  type NotificationCategory,
} from '@cultuvilla/shared/models/notification';

/**
 * The device-side half of push. Everything platform-specific on the client
 * lives here (and its `.web.ts` twin), so the provider, the sheet and the
 * settings screen never touch `expo-notifications` directly.
 */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export const isPushSupported = true;

/**
 * How a push that arrives while the app is OPEN is presented. Shown as a
 * banner and kept in the shade, but silent: the user is already looking at the
 * app, and a sound on top of an on-screen banner reads as an alarm.
 */
export function configureForegroundPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
  });
}

/**
 * Android 8+ drops a notification that names a channel the app never created,
 * and Android 13 will not even show the permission dialog until at least one
 * channel exists — so this must run before `requestPushPermission`. The ids
 * come from the same shared constant the server uses for `channelId`.
 * Idempotent: re-creating a channel updates its name, never the importance the
 * user may have changed in system settings.
 */
export async function ensureAndroidChannels(
  names: Record<NotificationCategory, string>,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    NOTIFICATION_CATEGORIES.map((category) => {
      const spec = ANDROID_CHANNELS[category];
      return Notifications.setNotificationChannelAsync(spec.id, {
        name: names[category],
        importance:
          spec.importance === 'high'
            ? Notifications.AndroidImportance.HIGH
            : Notifications.AndroidImportance.DEFAULT,
        enableVibrate: spec.vibrate,
        showBadge: true,
      });
    }),
  );
}

function toPermission(status: Notifications.NotificationPermissionsStatus): PushPermission {
  if (status.granted) return 'granted';
  if (status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  // Android reports `denied` both before the first ask on some versions and
  // after a refusal; `canAskAgain` is the only reliable way to tell them apart.
  return status.canAskAgain ? 'undetermined' : 'denied';
}

export async function getPushPermission(): Promise<PushPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

export async function requestPushPermission(): Promise<PushPermission> {
  return toPermission(
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    }),
  );
}

/**
 * Which APNs gateway this binary's tokens belong to, read from the entitlement
 * in the embedded provisioning profile — NOT from JS config. An OTA bundle is
 * built by `eas update`, which knows nothing about the binary it will run in,
 * so any value baked into the manifest would misreport a store binary as a
 * development one (or vice versa) and every iOS push would bounce.
 */
async function apnsEnvironment(): Promise<ApnsEnvironment> {
  const env = await Application.getIosPushNotificationServiceEnvironmentAsync();
  return env === 'development' ? 'sandbox' : 'production';
}

/**
 * The registration for this device, or null when there is nothing to register
 * (permission not granted, a simulator without push, a transient failure).
 * Never throws: a device that cannot register simply does not get push, and
 * the Buzón still has everything.
 *
 * `knownToken` is the token a refresh event delivered. Pass it from a token
 * listener: fetching the token fires the listeners on both platforms, so a
 * listener that fetches runs forever.
 */
export async function getPushRegistration(knownToken?: string): Promise<DeviceTokenDataInput | null> {
  try {
    if ((await getPushPermission()) !== 'granted') return null;
    const token = knownToken ?? (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token !== 'string' || token.length === 0) return null;
    const appVersion = Application.nativeApplicationVersion ?? '0.0.0';
    if (Platform.OS === 'ios') {
      return {
        token,
        platform: 'ios',
        apnsEnvironment: await apnsEnvironment(),
        apnsTopic: Application.applicationId ?? '',
        appVersion,
      };
    }
    return { token, platform: 'android', appVersion };
  } catch {
    return null;
  }
}

/**
 * FCM and APNs both rotate tokens; the new one must replace the old row. Also
 * fires with the unchanged token after every `getDevicePushTokenAsync`.
 */
export function onPushTokenRefresh(listener: (token: string) => void): () => void {
  const sub = Notifications.addPushTokenListener((token) => {
    listener(String(token.data));
  });
  return () => {
    sub.remove();
  };
}

export type PushTapData = Record<string, unknown>;

function tapData(response: Notifications.NotificationResponse): PushTapData {
  return response.notification.request.content.data ?? {};
}

/** A tap on a push while the app is running or backgrounded. */
export function onPushTap(listener: (data: PushTapData) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    listener(tapData(r));
  });
  return () => {
    sub.remove();
  };
}

/**
 * The tap that COLD-STARTED the app, if any — consumed once so a later remount
 * does not re-navigate to it.
 */
export function consumeLaunchTap(): PushTapData | null {
  const response = Notifications.getLastNotificationResponse();
  if (!response) return null;
  Notifications.clearLastNotificationResponse();
  return tapData(response);
}

export async function setAppBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Badge support varies by Android launcher; a missing badge is cosmetic.
  }
}

/** Permission was refused: only the OS settings screen can undo that. */
export async function openPushSettings(): Promise<void> {
  await Linking.openSettings();
}
