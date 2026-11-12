// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationChatCollection: vi.fn((_db, orgId: string, threadId: string) => ({ _path: `chat:${orgId}/${threadId}` })),
  organizationChatWriteCollection: vi.fn((_db, orgId: string, threadId: string) => ({ _path: `chat:${orgId}/${threadId}` })),
  organizationMessageDoc: vi.fn((_db, orgId: string, id: string) => ({ _path: `organizations/${orgId}/messages/${id}` })),
  organizationChatWriteDoc: vi.fn((_db, orgId: string, threadId: string, chatId: string) => ({
    _path: `chat:${orgId}/${threadId}/${chatId}`,
  })),
  organizationChatThreadDoc: vi.fn((_db, orgId: string, threadId: string) => ({ _path: `organizations/${orgId}/chatThreads/${threadId}` })),
  organizationChatReadDoc: vi.fn((_db, orgId: string, threadId: string, uid: string) => ({
    _path: `organizations/${orgId}/chatThreads/${threadId}/reads/${uid}`,
  })),
  organizationChatReadWriteDoc: vi.fn((_db, orgId: string, threadId: string, uid: string) => ({
    _path: `organizations/${orgId}/chatThreads/${threadId}/reads/${uid}`,
  })),
  userGroupPrefsDoc: vi.fn((_db, uid: string, orgId: string) => ({
    withConverter: () => ({ _path: `users/${uid}/groupPrefs/${orgId}` }),
  })),
}));
vi.mock('firebase/firestore', () => ({
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
  updateDoc: vi.fn(),
  doc: vi.fn((coll: { _path: string }) => ({ _path: `${coll._path}/new1`, id: 'new1' })),
  limit: vi.fn((n: number) => ({ limit: n })),
  orderBy: vi.fn((field: string, dir: string) => ({ orderBy: [field, dir] })),
  query: vi.fn((coll: { _path: string }, ...parts: unknown[]) => ({ coll: coll._path, parts })),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(() => () => undefined),
}));

import { deleteDoc, onSnapshot, query, setDoc, updateDoc } from 'firebase/firestore';
import {
  deleteGroupChatMessage,
  markGroupChatRead,
  sendGroupChatMessage,
  setGroupChatReaction,
  watchGroupAviso,
  watchGroupChat,
  watchGroupChatThreads,
} from '../../src/services/groupChatService';
import { GROUP_CHAT_BODY_MAX } from '../../src/models/organization/GroupChatDataModel';

const call = (fn: typeof setDoc | typeof deleteDoc, i = 0) => {
  const [ref, data, options] = vi.mocked(fn).mock.calls[i] as unknown as [{ _path: string }, Record<string, unknown>, unknown];
  return { path: ref._path, data, options };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('groupChatService', () => {
  it('writes a trimmed message as its author, stamped by the server', async () => {
    const id = await sendGroupChatMessage({ orgId: 'org1', threadId: 'general', uid: 'u1', authorName: 'Ana', body: '  Hola  ' });
    expect(id).toBe('new1');
    expect(call(setDoc)).toMatchObject({
      path: 'chat:org1/general/new1',
      data: { authorUid: 'u1', authorName: 'Ana', body: 'Hola', createdAt: 'SERVER_TS' },
    });
  });

  it('a reply carries the message it answers, whole', async () => {
    await sendGroupChatMessage({
      orgId: 'org1',
      threadId: 'general',
      uid: 'u1',
      authorName: 'Ana',
      body: 'Yo',
      replyTo: { id: 'c1', authorUid: 'u2', authorName: 'Paco', body: '¿Quién trae la tostadora?' },
    });
    expect(call(setDoc).data).toEqual({
      authorUid: 'u1',
      authorName: 'Ana',
      body: 'Yo',
      createdAt: 'SERVER_TS',
      replyTo: { chatId: 'c1', authorUid: 'u2', authorName: 'Paco', body: '¿Quién trae la tostadora?' },
    });
  });

  it('a message that answers nothing writes no replyTo', async () => {
    await sendGroupChatMessage({ orgId: 'org1', threadId: 'general', uid: 'u1', authorName: 'Ana', body: 'Hola' });
    expect(call(setDoc).data).not.toHaveProperty('replyTo');
  });

  it('sets or clears only the reader’s own reaction', async () => {
    await setGroupChatReaction('org1', 'general', 'c1', 'u1', '👍');
    expect(vi.mocked(updateDoc).mock.calls[0]).toEqual([{ _path: 'chat:org1/general/c1' }, { 'reactions.u1': '👍' }]);
    await setGroupChatReaction('org1', 'm1', 'c1', 'u1', null);
    expect(vi.mocked(updateDoc).mock.calls[1]).toEqual([{ _path: 'chat:org1/m1/c1' }, { 'reactions.u1': 'DELETE_FIELD' }]);
  });

  it('refuses an empty or over-long body before writing', async () => {
    await expect(sendGroupChatMessage({ orgId: 'org1', threadId: 'm1', uid: 'u1', authorName: 'Ana', body: '   ' })).rejects.toThrow();
    await expect(
      sendGroupChatMessage({ orgId: 'org1', threadId: 'm1', uid: 'u1', authorName: 'Ana', body: 'x'.repeat(GROUP_CHAT_BODY_MAX + 1) }),
    ).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('deletes one message of one thread', async () => {
    await deleteGroupChatMessage('org1', 'm1', 'c1');
    expect(call(deleteDoc).path).toBe('chat:org1/m1/c1');
  });

  it('a read is the reader’s own doc, moved to now', async () => {
    await markGroupChatRead('org1', 'general', 'u1');
    expect(call(setDoc)).toMatchObject({ path: 'organizations/org1/chatThreads/general/reads/u1', data: { readAt: 'SERVER_TS' } });
  });

  it('watches the newest messages first, as many as asked', () => {
    watchGroupChat('org1', 'm1', 50, vi.fn(), vi.fn());
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ _path: 'chat:org1/m1' }),
      { orderBy: ['createdAt', 'desc'] },
      { limit: 50 },
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('watches one summary per thread', () => {
    watchGroupChatThreads('org1', ['general', 'm1'], vi.fn(), vi.fn());
    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });

  it('watches an aviso, the head of its thread', () => {
    watchGroupAviso('org1', 'm1', vi.fn(), vi.fn());
    expect(vi.mocked(onSnapshot).mock.calls[0]?.[0]).toMatchObject({ _path: 'organizations/org1/messages/m1' });
  });
});
