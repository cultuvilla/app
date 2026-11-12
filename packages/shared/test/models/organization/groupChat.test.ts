import { describe, it, expect } from 'vitest';
import {
  GENERAL_CHAT_THREAD_ID,
  GROUP_CHAT_REACTIONS,
  GroupChatMessageDataSchema,
  countUnreadGroupChatThreads,
  groupChatAuthorColorIndex,
  groupChatLayout,
  groupChatReactionCounts,
  nextGroupChatReaction,
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

describe('reactions', () => {
  it('counts each offered reaction in order, marks the viewer’s, and drops unknown ones', () => {
    expect(groupChatReactionCounts({ a: '❤️', b: '👍', c: '👍', me: '❤️', d: '🦄' }, 'me')).toEqual([
      { emoji: '👍', count: 2, mine: false },
      { emoji: '❤️', count: 2, mine: true },
    ]);
    expect(groupChatReactionCounts(undefined, 'me')).toEqual([]);
  });

  it('a tap on the reaction you left takes it away; another one replaces it', () => {
    expect(nextGroupChatReaction('👍', '👍')).toBeNull();
    expect(nextGroupChatReaction('👍', '🙏')).toBe('🙏');
    expect(nextGroupChatReaction(undefined, '😂')).toBe('😂');
  });

  it('offers five, the list the rules hold', () => {
    expect(GROUP_CHAT_REACTIONS).toEqual(['👍', '❤️', '😂', '😮', '🙏']);
  });
});

describe('groupChatLayout', () => {
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour);

  it('groups one author’s consecutive messages and opens each day, reading newest first', () => {
    const rows = [
      { authorUid: 'me', createdAt: at(12, 19) },
      { authorUid: 'paco', createdAt: at(12, 18) },
      { authorUid: 'ana', createdAt: at(12, 10) },
      { authorUid: 'ana', createdAt: at(12, 9) },
      { authorUid: 'ana', createdAt: at(11, 22) },
    ];
    expect(groupChatLayout(rows)).toEqual([
      { newDay: false, firstOfRun: true },
      { newDay: false, firstOfRun: true },
      { newDay: false, firstOfRun: false },
      { newDay: true, firstOfRun: true },
      { newDay: true, firstOfRun: true },
    ]);
  });

  it('an empty thread lays out nothing', () => {
    expect(groupChatLayout([])).toEqual([]);
  });
});

describe('groupChatAuthorColorIndex', () => {
  it('keeps a person on one colour, inside the palette', () => {
    expect(groupChatAuthorColorIndex('abc', 5)).toBe(groupChatAuthorColorIndex('abc', 5));
    for (const uid of ['a', 'zz', 'u1', 'x'.repeat(40)]) {
      const i = groupChatAuthorColorIndex(uid, 5);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(5);
    }
  });
});

describe('GroupChatMessageDataSchema — replies and reactions', () => {
  const base = { authorUid: 'u1', authorName: 'Ana', body: 'Hola', createdAt: new Date() };

  it('reads a message without them, and one with them', () => {
    expect(GroupChatMessageDataSchema.parse(base)).toEqual(base);
    const full = {
      ...base,
      replyTo: { chatId: 'c1', authorUid: 'u2', authorName: 'Paco', body: 'Buenas' },
      reactions: { u2: '👍' },
    };
    expect(GroupChatMessageDataSchema.parse(full)).toEqual(full);
  });
});
