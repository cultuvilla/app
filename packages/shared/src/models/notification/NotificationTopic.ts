import type { EntityKind } from '../interaction/EntityKind';
import type { NotificationData, NotificationType } from './NotificationDataModel';
import type { NotificationCategory } from './NotificationCategory';

/**
 * The one taxonomy of notifications as a villager perceives them: each topic is
 * one switch in Ajustes → Notificaciones. The coarse `NotificationCategory`
 * stays underneath for what the OS needs (the Android channel, the quiet-hours
 * bypass); the topic is what a person mutes.
 *
 * The keys are stored (`mutedTopics`, and `topic` on a notification), so
 * renaming one is a data migration, not a refactor. Adding one is free: a
 * stored list of strings never makes an older converter throw.
 */
export const NOTIFICATION_TOPIC_SECTIONS = {
  events: ['event_reminders', 'event_seats', 'event_changes'],
  village: ['village_events', 'village_news', 'village_posters', 'village_places', 'village_history', 'village_wrapped'],
  groups: ['group_avisos', 'group_chats', 'group_cuotas', 'group_tasks', 'group_task_comments'],
  cosateca: ['cosateca_requests', 'cosateca_answers', 'cosateca_returns', 'cosateca_chat', 'cosateca_reservas'],
  community: ['comment_replies', 'my_requests', 'requests_to_handle'],
} as const;

export type NotificationTopicSection = keyof typeof NOTIFICATION_TOPIC_SECTIONS;
export type NotificationTopic = (typeof NOTIFICATION_TOPIC_SECTIONS)[NotificationTopicSection][number];

export const NOTIFICATION_TOPIC_SECTION_ORDER: readonly NotificationTopicSection[] = [
  'events',
  'village',
  'groups',
  'cosateca',
  'community',
];

export const NOTIFICATION_TOPICS: readonly NotificationTopic[] = NOTIFICATION_TOPIC_SECTION_ORDER.flatMap(
  (section) => NOTIFICATION_TOPIC_SECTIONS[section],
);

export function isNotificationTopic(value: unknown): value is NotificationTopic {
  return typeof value === 'string' && (NOTIFICATION_TOPICS as readonly string[]).includes(value);
}

export function topicSection(topic: NotificationTopic): NotificationTopicSection {
  const section = NOTIFICATION_TOPIC_SECTION_ORDER.find((s) =>
    (NOTIFICATION_TOPIC_SECTIONS[s] as readonly string[]).includes(topic),
  );
  if (!section) throw new Error(`Topic without a section: ${topic}`);
  return section;
}

/**
 * The topics `group_task` carries. That one type covers tasks, shifts, their
 * comments, the cosateca and its reservas — a new type would make installed
 * binaries' strict converter throw — so its producers stamp `topic` on the doc.
 */
export const GROUP_TASK_TOPICS = [
  'group_tasks',
  'group_task_comments',
  ...NOTIFICATION_TOPIC_SECTIONS.cosateca,
] as const satisfies readonly NotificationTopic[];
export type GroupTaskTopic = (typeof GROUP_TASK_TOPICS)[number];

function isGroupTaskTopic(value: string | null): value is GroupTaskTopic {
  return (GROUP_TASK_TOPICS as readonly (string | null)[]).includes(value);
}

/** Topics a notification type maps to on its own, with no field to read. */
const TOPIC_BY_TYPE: Partial<Record<NotificationType, NotificationTopic>> = {
  event_reminder: 'event_reminders',
  waitlist_promoted: 'event_seats',
  seat_claimed: 'event_seats',
  seat_released: 'event_seats',
  registration_removed: 'event_seats',
  event_cancelled: 'event_changes',
  event_updated: 'event_changes',
  signups_disabled: 'event_changes',
  village_wrapped_reminder: 'village_wrapped',
  village_wrapped_published: 'village_wrapped',
  cuota_reminder: 'group_cuotas',
  comment_reply: 'comment_replies',
  org_approved: 'my_requests',
  org_rejected: 'my_requests',
  organizer_request_approved: 'my_requests',
  organizer_request_rejected: 'my_requests',
  org_join_request_approved: 'my_requests',
  org_join_request_rejected: 'my_requests',
  organizer_request_created: 'requests_to_handle',
  org_join_request_created: 'requests_to_handle',
};

const VILLAGE_TOPIC_BY_KIND: Record<EntityKind, NotificationTopic> = {
  event: 'village_events',
  news: 'village_news',
  festivalPoster: 'village_posters',
  place: 'village_places',
  barrio: 'village_places',
  organization: 'village_places',
  historyEntry: 'village_history',
  vocabularyTerm: 'village_history',
};

/**
 * The switch a notification answers to. Derived from the type wherever the type
 * says enough, so no category or kind ever needs a backfill; only `group_task`
 * reads the stamped `topic`, and falls back to `group_tasks` for a doc written
 * before producers stamped it, or with a topic this build does not know.
 */
export function notificationTopic(
  n: Pick<NotificationData, 'type' | 'entityKind' | 'chatThreadId' | 'topic'>,
): NotificationTopic {
  switch (n.type) {
    case 'village_entity_published':
      return n.entityKind ? VILLAGE_TOPIC_BY_KIND[n.entityKind] : 'village_news';
    case 'group_message':
      return n.chatThreadId ? 'group_chats' : 'group_avisos';
    case 'group_task':
      return isGroupTaskTopic(n.topic) ? n.topic : 'group_tasks';
    default: {
      const topic = TOPIC_BY_TYPE[n.type];
      if (!topic) throw new Error(`Notification type without a topic: ${n.type}`);
      return topic;
    }
  }
}

/**
 * The legacy category switch (`preferences/notifications`) each topic sat under,
 * for folding an old all-or-nothing mute into topics. `null` for the group's
 * messages, which never had an account-wide switch.
 */
export const TOPIC_LEGACY_CATEGORY: Record<NotificationTopic, Exclude<NotificationCategory, 'groups'> | null> = {
  event_reminders: 'mine',
  event_seats: 'mine',
  event_changes: 'mine',
  village_events: 'village',
  village_news: 'village',
  village_posters: 'village',
  village_places: 'village',
  village_history: 'village',
  village_wrapped: 'village',
  group_avisos: null,
  group_chats: null,
  group_cuotas: 'mine',
  group_tasks: 'mine',
  group_task_comments: 'mine',
  cosateca_requests: 'mine',
  cosateca_answers: 'mine',
  cosateca_returns: 'mine',
  cosateca_chat: 'mine',
  cosateca_reservas: 'mine',
  comment_replies: 'social',
  my_requests: 'social',
  requests_to_handle: 'social',
};
