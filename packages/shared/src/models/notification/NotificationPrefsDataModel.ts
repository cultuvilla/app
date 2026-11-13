import { z } from 'zod';

/**
 * Per-account push preferences at `users/{uid}/preferences/notifications`.
 *
 * **The doc is optional.** An account that has never opened the notification
 * settings has no doc at all, and `DEFAULT_NOTIFICATION_PREFS` applies. That is
 * not a tolerated-stale-data shim: the document genuinely does not exist yet,
 * so there is nothing to backfill and no strict converter that can crash on an
 * account created before this feature.
 *
 * These gate PUSH only. The in-app Buzón always receives everything — muting a
 * category must not silently destroy the durable record of what happened.
 *
 * Superseded by the per-topic `NotificationSettingsData`. Kept while installed
 * binaries still read and write it; the server honours both, and the current app
 * writes this one back all-on with `quietHours` in step.
 */
export const NotificationPrefsDataSchema = z.object({
  /** Seats, registrations and requests the user personally holds. */
  mine: z.boolean(),
  /** Anything new published in a village the user belongs to. */
  village: z.boolean(),
  /** Comment replies and organization/organizer outcomes. */
  social: z.boolean(),
  /**
   * Hold `village` and `social` pushes overnight (22:00–08:00 Europe/Madrid).
   * Never applies to `mine` — a released seat is worth a buzz at 23:00.
   */
  quietHours: z.boolean(),
  updatedAt: z.date(),
});
export type NotificationPrefsData = z.infer<typeof NotificationPrefsDataSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsData = {
  mine: true,
  village: true,
  social: true,
  quietHours: true,
  // A sentinel, not a real edit: this value is only ever seen for an account
  // with no stored doc, and nothing reads it except a debug view.
  updatedAt: new Date(0),
};

export interface NotificationPrefsDataInput {
  mine?: boolean;
  village?: boolean;
  social?: boolean;
  quietHours?: boolean;
  updatedAt?: Date;
}

export function buildNotificationPrefsData(
  input: NotificationPrefsDataInput = {},
): NotificationPrefsData {
  return {
    mine: input.mine ?? DEFAULT_NOTIFICATION_PREFS.mine,
    village: input.village ?? DEFAULT_NOTIFICATION_PREFS.village,
    social: input.social ?? DEFAULT_NOTIFICATION_PREFS.social,
    quietHours: input.quietHours ?? DEFAULT_NOTIFICATION_PREFS.quietHours,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

/**
 * A member's push preference for one group's messages, at
 * `users/{uid}/groupPrefs/{orgId}`. Optional like the account's prefs: no doc
 * means the group's messages push. Gates `group_message` pushes only — the
 * Buzón keeps them, and the cuota reminders (push and email) never read it.
 */
export const GroupNotificationPrefsDataSchema = z.object({
  messagesMuted: z.boolean(),
  // Chat messages notify nobody unless they opt in here, one switch for the
  // group's general chat and its avisos' chats. Apart from `messagesMuted`, which
  // silences only the avisos. Defaults because installed binaries rewrite the whole doc
  // without it when they (un)mute — which turns the opt-in off.
  chatPush: z.boolean().default(false),
  // The doc's own id, stored so the chat trigger can find a group's opted-in
  // members with one collection-group query. Rules pin it to the path.
  orgId: z.string().nullable().default(null),
  updatedAt: z.date(),
});
export type GroupNotificationPrefsData = z.infer<typeof GroupNotificationPrefsDataSchema>;

export function buildGroupNotificationPrefsData(input: {
  messagesMuted: boolean;
  chatPush?: boolean;
  orgId?: string | null;
  updatedAt?: Date;
}): GroupNotificationPrefsData {
  return {
    messagesMuted: input.messagesMuted,
    chatPush: input.chatPush ?? false,
    orgId: input.orgId ?? null,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

/**
 * How much one group notifies a member, as the three levels Ajustes →
 * Notificaciones offers. Stored as the two switches of the group's prefs doc,
 * which installed binaries still read and write.
 */
export const GROUP_NOTIFY_LEVELS = ['all', 'avisos', 'none'] as const;
export type GroupNotifyLevel = (typeof GROUP_NOTIFY_LEVELS)[number];

export function groupNotifyLevel(prefs: Pick<GroupNotificationPrefsData, 'messagesMuted' | 'chatPush'> | null): GroupNotifyLevel {
  if (prefs?.chatPush) return 'all';
  return prefs?.messagesMuted ? 'none' : 'avisos';
}

export function groupNotifyPrefs(level: GroupNotifyLevel): Pick<GroupNotificationPrefsData, 'messagesMuted' | 'chatPush'> {
  return { messagesMuted: level === 'none', chatPush: level === 'all' };
}
