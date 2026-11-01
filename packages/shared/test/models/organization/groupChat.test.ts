import { describe, it, expect } from 'vitest';
import {
  GENERAL_CHAT_THREAD_ID,
  GroupChatMessageDataSchema,
  countUnreadGroupChatThreads,
  groupChatMessagePath,
  groupChatPushBody,
  isGeneralChatThread,
  isGroupChatThreadUnread,
  parseGroupChatMessagePath,
} from '../../../src/models/organization/GroupChatDataModel';
import { GroupNotificationPrefsDataSchema, buildGroupNotificationPrefsData } from '../../../src/models/notification/NotificationPrefsDataModel';
import { OrganizationDataSchema, buildOrganizationData } from '../../../src/models/organization/OrganizationDataModel';

const t = (min: number) => new Date(Date.UTC(2026, 10, 1, 10, min));

describe('isGroupChatThreadUnread', () => {
  const thread = { lastMessageAt: t(10), lastAuthorUid: 'ana' };

  it('a thread nobody wrote in is never unread', () => {
    expect(isGroupChatThreadUnread(null, null, 'paco')).toBe(false);
  });

  it('a message after the last open, or never opened, is unread', () => {
    expect(isGroupChatThreadUnread(thread, null, 'paco')).toBe(true);
    expect(isGroupChatThreadUnread(thread, { readAt: t(5) }, 'paco')).toBe(true);
    expect(isGroupChatThreadUnread(thread, { readAt: t(10) }, 'paco')).toBe(false);
    expect(isGroupChatThreadUnread(thread, { readAt: t(11) }, 'paco')).toBe(false);
  });

  it('a thread whose last word is yours is read', () => {
    expect(isGroupChatThreadUnread(thread, null, 'ana')).toBe(false);
  });

  it('counts the unread threads, matching reads by id', () => {
    const threads = [
      { id: GENERAL_CHAT_THREAD_ID, ...thread },
      { id: 'm1', lastMessageAt: t(20), lastAuthorUid: 'ana' },
      { id: 'm2', lastMessageAt: t(20), lastAuthorUid: 'paco' },
    ];
    expect(countUnreadGroupChatThreads(threads, [{ id: 'm1', readAt: t(30) }], 'paco')).toBe(1);
    expect(countUnreadGroupChatThreads(threads, [], 'luis')).toBe(3);
  });
});

describe('groupChatMessagePath', () => {
  it('names the message in either kind of thread', () => {
    expect(groupChatMessagePath('o1', 'general', 'c1')).toBe('organizations/o1/chat/c1');
    expect(groupChatMessagePath('o1', 'm1', 'c1')).toBe('organizations/o1/messages/m1/chat/c1');
  });
});

describe('parseGroupChatMessagePath', () => {
  it('reads back the path of a message in either kind of thread', () => {
    expect(parseGroupChatMessagePath(groupChatMessagePath('o1', 'general', 'c1'))).toEqual({
      orgId: 'o1',
      threadId: 'general',
      chatId: 'c1',
    });
    expect(parseGroupChatMessagePath(groupChatMessagePath('o1', 'm1', 'c1'))).toEqual({
      orgId: 'o1',
      threadId: 'm1',
      chatId: 'c1',
    });
  });

  it('is null for the target of any other report', () => {
    expect(parseGroupChatMessagePath('c1')).toBeNull();
    expect(parseGroupChatMessagePath('organizations/o1')).toBeNull();
    expect(parseGroupChatMessagePath('organizations/o1/members/u1')).toBeNull();
  });
});

describe('groupChatPushBody', () => {
  it('names the author and cuts the message to a single-line preview', () => {
    expect(groupChatPushBody('Ana', 'Hola\n\nqué tal')).toBe('Ana: Hola qué tal');
    const long = groupChatPushBody('Ana', 'x'.repeat(300), 20);
    expect(long).toHaveLength('Ana: '.length + 20);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('the chat’s stored shapes', () => {
  it('a message carries its author’s name and a date', () => {
    expect(GroupChatMessageDataSchema.parse({ authorUid: 'u1', authorName: 'Ana', body: 'Hola', createdAt: t(0) })).toBeTruthy();
    expect(() => GroupChatMessageDataSchema.parse({ authorUid: 'u1', body: 'Hola', createdAt: t(0) })).toThrow();
  });

  it('the general thread has a fixed id an aviso’s can never take', () => {
    expect(isGeneralChatThread('general')).toBe(true);
    expect(isGeneralChatThread('a1B2c3D4e5F6g7H8i9J0')).toBe(false);
  });

  it('a group prefs doc written by an older binary parses with the chat opt-in off', () => {
    expect(GroupNotificationPrefsDataSchema.parse({ messagesMuted: true, updatedAt: t(0) }).chatPush).toBe(false);
    expect(buildGroupNotificationPrefsData({ messagesMuted: false, chatPush: true }).chatPush).toBe(true);
  });

  it('an org without the setting lets every member write', () => {
    const org = buildOrganizationData({ name: 'Peña', type: 'peña', municipalityId: 'm1', villageSlug: 'v', requestedBy: 'u1' });
    expect(org.chatAdminsOnly).toBe(false);
    const { chatAdminsOnly: _omit, ...older } = org;
    expect(OrganizationDataSchema.parse(older).chatAdminsOnly).toBe(false);
  });
});
