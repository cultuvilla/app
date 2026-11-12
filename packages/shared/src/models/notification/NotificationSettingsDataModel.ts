import { z } from 'zod';
import type { NotificationPrefsData } from './NotificationPrefsDataModel';
import {
  NOTIFICATION_TOPIC_SECTIONS,
  NOTIFICATION_TOPICS,
  TOPIC_LEGACY_CATEGORY,
  isNotificationTopic,
  type NotificationTopic,
} from './NotificationTopic';

export const MAX_MUTED_TOPICS = 64;
export const MAX_MUTED_VILLAGES = 50;

/**
 * Per-account push switches at `users/{uid}/notificationSettings/account`, one
 * per `NotificationTopic`, plus a per-pueblo mute for village news.
 *
 * It replaces the three coarse switches at `users/{uid}/preferences/notifications`
 * (`NotificationPrefsData`), which installed binaries still read and write —
 * with a full `setDoc` that would wipe any field this model added there. So it
 * lives in its own doc, and until `minSupported` passes the binary that ships
 * it, the server honours both: a push goes out only if neither mutes it. The new
 * app folds an old mute into topics on read and writes the old doc back all-on.
 *
 * Optional, like the old doc: no doc means everything pushes. Lists of strings,
 * not an enum, so a topic added later never makes an older converter throw.
 * Gates PUSH only — the Buzón keeps everything.
 */
export const NotificationSettingsDataSchema = z.object({
  mutedTopics: z.array(z.string()).max(MAX_MUTED_TOPICS),
  /** Municipalities whose `Tu pueblo` notifications do not push. */
  mutedVillages: z.array(z.string()).max(MAX_MUTED_VILLAGES),
  /** Hold non-urgent pushes overnight (22:00–08:00 Europe/Madrid). */
  quietHours: z.boolean(),
  updatedAt: z.date(),
});
export type NotificationSettingsData = z.infer<typeof NotificationSettingsDataSchema>;

export const NOTIFICATION_SETTINGS_DOC_ID = 'account';

export interface NotificationSettingsDataInput {
  mutedTopics?: readonly NotificationTopic[];
  mutedVillages?: readonly string[];
  quietHours?: boolean;
  updatedAt?: Date;
}

export function buildNotificationSettingsData(input: NotificationSettingsDataInput = {}): NotificationSettingsData {
  return {
    mutedTopics: NOTIFICATION_TOPICS.filter((t) => input.mutedTopics?.includes(t) ?? false),
    mutedVillages: [...new Set(input.mutedVillages ?? [])].sort(),
    quietHours: input.quietHours ?? true,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

/** The settings as one person sees them: topics resolved, and the old coarse mutes folded in. */
export interface ResolvedNotificationSettings {
  mutedTopics: ReadonlySet<NotificationTopic>;
  mutedVillages: ReadonlySet<string>;
  quietHours: boolean;
}

/**
 * Both docs, read as one. A coarse category switched off — before the topics
 * existed, or since, from a device still on an older binary — mutes every topic
 * that sat under it. Quiet hours read the new doc once it exists: the new app
 * keeps the old doc's copy in step, so they only differ when an older binary
 * changed it, and the doc written by the newer screen is the deliberate choice.
 */
export function resolveNotificationSettings(
  legacy: NotificationPrefsData | null,
  settings: NotificationSettingsData | null,
): ResolvedNotificationSettings {
  const mutedTopics = new Set<NotificationTopic>((settings?.mutedTopics ?? []).filter(isNotificationTopic));
  if (legacy) {
    for (const topic of NOTIFICATION_TOPICS) {
      const category = TOPIC_LEGACY_CATEGORY[topic];
      if (category !== null && !legacy[category]) mutedTopics.add(topic);
    }
  }
  return {
    mutedTopics,
    mutedVillages: new Set(settings?.mutedVillages ?? []),
    quietHours: settings?.quietHours ?? legacy?.quietHours ?? true,
  };
}

const VILLAGE_TOPICS: readonly NotificationTopic[] = NOTIFICATION_TOPIC_SECTIONS.village;

/**
 * Whether a notification of `topic` pushes. A muted pueblo silences its `Tu
 * pueblo` topics only: what a person signed up to there, or a group they are in,
 * still reaches them.
 */
export function allowsTopicPush(
  settings: ResolvedNotificationSettings,
  topic: NotificationTopic,
  municipalityId: string | null,
): boolean {
  if (settings.mutedTopics.has(topic)) return false;
  if (municipalityId !== null && VILLAGE_TOPICS.includes(topic) && settings.mutedVillages.has(municipalityId)) {
    return false;
  }
  return true;
}
