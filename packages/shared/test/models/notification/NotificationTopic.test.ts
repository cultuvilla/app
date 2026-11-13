import { describe, it, expect } from 'vitest';
import { ENTITY_KINDS } from '../../../src/models/interaction/EntityKind';
import {
  GROUP_TASK_TOPICS,
  NOTIFICATION_TOPICS,
  NOTIFICATION_TOPIC_SECTIONS,
  NotificationDataSchema,
  NotificationTypeSchema,
  TOPIC_LEGACY_CATEGORY,
  buildNotificationData,
  notificationCategory,
  notificationTopic,
  type NotificationType,
} from '../../../src/models/notification';

const note = (type: NotificationType, extra: Partial<Parameters<typeof buildNotificationData>[0]> = {}) =>
  buildNotificationData({ type, title: 't', body: 'b', ...extra });

describe('notificationTopic', () => {
  it('gives every notification type a topic', () => {
    for (const type of NotificationTypeSchema.options) {
      expect(NOTIFICATION_TOPICS).toContain(notificationTopic(note(type)));
    }
  });

  it('gives every village entity kind a Tu pueblo topic', () => {
    for (const entityKind of ENTITY_KINDS) {
      const topic = notificationTopic(note('village_entity_published', { entityKind }));
      expect(NOTIFICATION_TOPIC_SECTIONS.village).toContain(topic);
    }
    expect(notificationTopic(note('village_entity_published', { entityKind: 'festivalPoster' }))).toBe('village_posters');
    expect(notificationTopic(note('village_entity_published', { entityKind: 'barrio' }))).toBe('village_places');
  });

  it('splits a group’s avisos from its chats', () => {
    expect(notificationTopic(note('group_message'))).toBe('group_avisos');
    expect(notificationTopic(note('group_message', { chatThreadId: 'general' }))).toBe('group_chats');
  });

  it('reads the stamped topic of a group_task, and only a group_task topic', () => {
    for (const topic of GROUP_TASK_TOPICS) {
      expect(notificationTopic(note('group_task', { topic }))).toBe(topic);
    }
    expect(notificationTopic(note('group_task'))).toBe('group_tasks');
    expect(notificationTopic({ ...note('group_task'), topic: 'event_seats' })).toBe('group_tasks');
    expect(notificationTopic({ ...note('group_task'), topic: 'from_a_newer_build' })).toBe('group_tasks');
  });

  it('separates the requests a person sent from the ones they handle', () => {
    expect(notificationTopic(note('org_join_request_approved'))).toBe('my_requests');
    expect(notificationTopic(note('org_join_request_created'))).toBe('requests_to_handle');
  });

  it('files each topic under the coarse switch its notifications already answered to', () => {
    for (const type of NotificationTypeSchema.options) {
      const n = note(type, { entityKind: type === 'village_entity_published' ? 'event' : null });
      const category = notificationCategory(type);
      expect(TOPIC_LEGACY_CATEGORY[notificationTopic(n)]).toBe(category === 'groups' ? null : category);
    }
  });

  it('lists every topic once', () => {
    expect(new Set(NOTIFICATION_TOPICS).size).toBe(NOTIFICATION_TOPICS.length);
  });
});

describe('NotificationData.topic', () => {
  it('defaults to null, and parses a topic this build does not know', () => {
    expect(note('group_task').topic).toBeNull();
    const { topic: _omitted, ...stored } = note('group_task');
    expect(NotificationDataSchema.parse(stored).topic).toBeNull();
    expect(NotificationDataSchema.parse({ ...stored, topic: 'from_a_newer_build' }).topic).toBe('from_a_newer_build');
  });
});
