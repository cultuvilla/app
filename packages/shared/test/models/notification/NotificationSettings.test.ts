import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_TOPIC_SECTIONS,
  NotificationSettingsDataSchema,
  allowsTopicPush,
  buildNotificationPrefsData,
  buildNotificationSettingsData,
  resolveNotificationSettings,
} from '../../../src/models/notification';

describe('buildNotificationSettingsData', () => {
  it('defaults to everything on, quiet hours included', () => {
    expect(buildNotificationSettingsData()).toMatchObject({ mutedTopics: [], mutedVillages: [], quietHours: true });
  });

  it('stores topics in their screen order and villages deduplicated', () => {
    const d = buildNotificationSettingsData({
      mutedTopics: ['cosateca_chat', 'event_seats'],
      mutedVillages: ['b', 'a', 'b'],
    });
    expect(d.mutedTopics).toEqual(['event_seats', 'cosateca_chat']);
    expect(d.mutedVillages).toEqual(['a', 'b']);
  });

  it('parses a stored topic a newer build added', () => {
    const parsed = NotificationSettingsDataSchema.parse({ ...buildNotificationSettingsData(), mutedTopics: ['future_topic'] });
    expect(parsed.mutedTopics).toEqual(['future_topic']);
  });
});

describe('resolveNotificationSettings', () => {
  it('turns everything on when neither doc exists', () => {
    const r = resolveNotificationSettings(null, null);
    expect(r.mutedTopics.size).toBe(0);
    expect(r.quietHours).toBe(true);
  });

  it('folds a coarse mute into every topic that sat under it', () => {
    const r = resolveNotificationSettings(buildNotificationPrefsData({ village: false }), null);
    expect([...r.mutedTopics].sort()).toEqual([...NOTIFICATION_TOPIC_SECTIONS.village].sort());
  });

  it('never mutes the group’s messages through a coarse switch', () => {
    const r = resolveNotificationSettings(buildNotificationPrefsData({ mine: false, village: false, social: false }), null);
    expect(r.mutedTopics.has('group_avisos')).toBe(false);
    expect(r.mutedTopics.has('group_chats')).toBe(false);
    expect(r.mutedTopics.has('cosateca_reservas')).toBe(true);
  });

  it('keeps both docs’ mutes, and drops unknown topics', () => {
    const r = resolveNotificationSettings(
      buildNotificationPrefsData({ social: false }),
      { ...buildNotificationSettingsData({ mutedTopics: ['event_reminders'] }), mutedTopics: ['event_reminders', 'future_topic'] },
    );
    expect(r.mutedTopics.has('event_reminders')).toBe(true);
    expect(r.mutedTopics.has('comment_replies')).toBe(true);
    expect(r.mutedTopics.size).toBe(1 + NOTIFICATION_TOPIC_SECTIONS.community.length);
  });

  it('takes quiet hours from the new doc once it exists', () => {
    expect(resolveNotificationSettings(buildNotificationPrefsData({ quietHours: false }), null).quietHours).toBe(false);
    expect(
      resolveNotificationSettings(
        buildNotificationPrefsData({ quietHours: false }),
        buildNotificationSettingsData({ quietHours: true }),
      ).quietHours,
    ).toBe(true);
  });
});

describe('allowsTopicPush', () => {
  const settings = resolveNotificationSettings(
    null,
    buildNotificationSettingsData({ mutedTopics: ['village_news'], mutedVillages: ['city'] }),
  );

  it('blocks a muted topic', () => {
    expect(allowsTopicPush(settings, 'village_news', 'pueblo')).toBe(false);
    expect(allowsTopicPush(settings, 'village_events', 'pueblo')).toBe(true);
  });

  it('silences a muted pueblo’s news only', () => {
    expect(allowsTopicPush(settings, 'village_events', 'city')).toBe(false);
    expect(allowsTopicPush(settings, 'event_seats', 'city')).toBe(true);
    expect(allowsTopicPush(settings, 'group_tasks', 'city')).toBe(true);
    expect(allowsTopicPush(settings, 'village_events', null)).toBe(true);
  });
});
