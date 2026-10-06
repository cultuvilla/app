import type { NotificationType } from './NotificationDataModel';

/**
 * The three buckets a notification can fall into. This is the ONLY axis a user
 * can mute, and on Android it is also the set of OS notification channels — so
 * keep it small and keep it meaningful to a villager, not to the schema.
 *
 * Deliberately NOT a field on the notification doc. Deriving it from `type`
 * means adding a category can never require a backfill, and the mapping cannot
 * drift from the type the way a stored copy would.
 */
export const NOTIFICATION_CATEGORIES = ['mine', 'village', 'social'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * `mine` is the transactional bucket: something happened to a seat, a request,
 * or a registration the user personally holds. It is the only category that
 * bypasses quiet hours and the only one that gets an urgent delivery hint —
 * "se ha liberado tu plaza" is worth a buzz at 23:00, "nuevo evento en el
 * pueblo" is not.
 */
export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory> = {
  waitlist_promoted: 'mine',
  seat_claimed: 'mine',
  seat_released: 'mine',
  event_cancelled: 'mine',
  event_updated: 'mine',
  signups_disabled: 'mine',
  registration_removed: 'mine',
  event_reminder: 'mine',

  village_entity_published: 'village',
  // Addressed to village admins, but it is about the pueblo, not about them,
  // and nothing is lost by muting it: an unanswered Wrapped publishes itself.
  // Not worth breaking quiet hours for, so not `mine`.
  village_wrapped_reminder: 'village',
  village_wrapped_published: 'village',

  org_approved: 'social',
  org_rejected: 'social',
  organizer_request_created: 'social',
  organizer_request_approved: 'social',
  organizer_request_rejected: 'social',
  org_join_request_created: 'social',
  org_join_request_approved: 'social',
  org_join_request_rejected: 'social',
  comment_reply: 'social',
};

export function notificationCategory(type: NotificationType): NotificationCategory {
  return NOTIFICATION_CATEGORY[type];
}

/**
 * Android 8+ requires every notification to name a channel, and the channel is
 * what the OS settings screen exposes as a per-kind mute. Using the category id
 * verbatim as the channel id means the server's `channelId` and the client's
 * `setNotificationChannelAsync` cannot drift apart — there is nothing to keep
 * in sync, because there is only one value.
 *
 * iOS has no equivalent; there the in-app toggle is the only mute, which is why
 * the preference check happens server-side rather than being left to the OS.
 */
export type AndroidChannelId = NotificationCategory;

export interface AndroidChannelSpec {
  id: AndroidChannelId;
  /** Android importance, in expo-notifications' numeric scale. */
  importance: 'high' | 'default';
  vibrate: boolean;
}

export const ANDROID_CHANNELS: Record<NotificationCategory, AndroidChannelSpec> = {
  mine: { id: 'mine', importance: 'high', vibrate: true },
  village: { id: 'village', importance: 'default', vibrate: false },
  social: { id: 'social', importance: 'default', vibrate: false },
};
