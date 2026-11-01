// vi.mock factories fake the firebase/firestore SDK shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getDb: vi.fn(() => ({})), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('../../src/firebase/refs/client', () => ({
  organizationMessageDeliveriesCollection: vi.fn(),
  organizationMessageDoc: vi.fn((_db, orgId: string, id: string) => ({ withConverter: () => ({ _path: `organizations/${orgId}/messages/${id}` }) })),
  organizationMessageReadDoc: vi.fn(),
  organizationMessageReadsCollection: vi.fn(),
  organizationMessagesCollection: vi.fn(),
  organizationMessageVoteDoc: vi.fn(),
  organizationMessageVotesCollection: vi.fn(),
  organizationMessageWriteDoc: vi.fn((_db, orgId: string, messageId: string, sub: string, id: string) => ({
    _path: `organizations/${orgId}/messages/${messageId}/${sub}/${id}`,
  })),
  userGroupPrefsDoc: vi.fn((_db, uid: string, orgId: string) => ({
    withConverter: () => ({ _path: `users/${uid}/groupPrefs/${orgId}` }),
  })),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));
const { callable } = vi.hoisted(() => ({ callable: vi.fn(() => Promise.resolve({ data: { nudged: 2 } })) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));

import { setDoc, updateDoc } from 'firebase/firestore';
import {
  castGroupPollVote,
  markGroupMessageRead,
  nudgeGroupMessage,
  setGroupMessagesMuted,
  setWhatsappSent,
} from '../../src/services/groupMessageService';

const call = (fn: typeof setDoc | typeof updateDoc, i = 0) => {
  const [ref, data] = vi.mocked(fn).mock.calls[i] as unknown as [{ _path: string }, Record<string, unknown>];
  return { path: ref._path, data };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('groupMessageService', () => {
  it('a read and a vote are the member’s own docs, stamped by the server', async () => {
    await markGroupMessageRead('org1', 'm1', 'u1');
    expect(call(setDoc)).toEqual({ path: 'organizations/org1/messages/m1/reads/u1', data: { readAt: 'SERVER_TS' } });
    await castGroupPollVote('org1', 'm1', 'u1', 1);
    expect(call(setDoc, 1)).toEqual({ path: 'organizations/org1/messages/m1/votes/u1', data: { option: 1, votedAt: 'SERVER_TS' } });
  });

  it('refuses a vote that is not an option index', async () => {
    await expect(castGroupPollVote('org1', 'm1', 'u1', -1)).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('the WhatsApp tick names the admin and the time, and unticking clears both', async () => {
    await setWhatsappSent('org1', 'm1', 'typed_t1', 'admin1', true);
    expect(call(updateDoc)).toEqual({
      path: 'organizations/org1/messages/m1/deliveries/typed_t1',
      data: { whatsappSentAt: 'SERVER_TS', whatsappSentBy: 'admin1' },
    });
    await setWhatsappSent('org1', 'm1', 'typed_t1', 'admin1', false);
    expect(call(updateDoc, 1).data).toEqual({ whatsappSentAt: null, whatsappSentBy: null });
  });

  it('mutes one group for one account', async () => {
    await setGroupMessagesMuted('u1', 'org1', true);
    const { path, data } = call(setDoc);
    expect(path).toBe('users/u1/groupPrefs/org1');
    expect(data).toMatchObject({ messagesMuted: true });
    // A merge that never names the chat opt-in, so muting keeps it.
    expect(data).not.toHaveProperty('generalChatPush');
    expect(vi.mocked(setDoc).mock.calls[0]?.[2]).toEqual({ merge: true });
  });

  it('nudges through the callable', async () => {
    await expect(nudgeGroupMessage('org1', 'm1')).resolves.toEqual({ nudged: 2 });
    expect(callable).toHaveBeenCalledWith({ orgId: 'org1', messageId: 'm1' });
  });
});
