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
  setGroupNotifyLevel,
  setWhatsappSent,
} from '../../src/services/groupMessageService';

const call = (fn: typeof setDoc | typeof updateDoc, i = 0) => {
  const [ref, data] = vi.mocked(fn).mock.calls[i] as unknown as [{ _path: string }, Record<string, unknown>];
  return { path: ref._path, data };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setDoc).mockResolvedValue(undefined);
});

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'firestore/permission-denied' });

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

  it('sets one group’s notify level as both switches, merged', async () => {
    await setGroupNotifyLevel('u1', 'org1', 'none');
    const { path, data } = call(setDoc);
    expect(path).toBe('users/u1/groupPrefs/org1');
    expect(data).toMatchObject({ messagesMuted: true, chatPush: false, orgId: 'org1' });
    expect(vi.mocked(setDoc).mock.calls[0]?.[2]).toEqual({ merge: true });
    await setGroupNotifyLevel('u1', 'org1', 'all');
    expect(call(setDoc, 1).data).toMatchObject({ messagesMuted: false, chatPush: true });
  });

  describe('a read receipt is written once', () => {
    // The ios-e2e loop (2026-11-20): the aviso screen marks whenever its read
    // list lacks the receipt, and each refused rewrite is a pending local write
    // that rolls back — which leaves the list lacking it again.
    it('a refused rewrite does not re-arm a caller that marks on every rollback', async () => {
      vi.mocked(setDoc).mockResolvedValueOnce(undefined).mockRejectedValue(denied());
      let rollbacks = 0;
      const screenSeesItUnread = async (): Promise<void> => {
        await markGroupMessageRead('org-loop', 'm1', 'u1').catch(() => undefined);
        if (vi.mocked(setDoc).mock.calls.length > 1 && rollbacks < 20) {
          rollbacks += 1;
          await screenSeesItUnread();
        }
      };
      await screenSeesItUnread();
      await screenSeesItUnread();
      await screenSeesItUnread();
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('a receipt the rules refuse counts as read and is never sent again', async () => {
      vi.mocked(setDoc).mockRejectedValue(denied());
      await expect(markGroupMessageRead('org-denied', 'm1', 'u1')).resolves.toBeUndefined();
      await expect(markGroupMessageRead('org-denied', 'm1', 'u1')).resolves.toBeUndefined();
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('two callers marking at once share one write', async () => {
      await Promise.all([markGroupMessageRead('org-twice', 'm1', 'u1'), markGroupMessageRead('org-twice', 'm1', 'u1')]);
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it('a transient failure rejects, and the next mark tries again', async () => {
      vi.mocked(setDoc).mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
      await expect(markGroupMessageRead('org-flaky', 'm1', 'u1')).rejects.toThrow('offline');
      await markGroupMessageRead('org-flaky', 'm1', 'u1');
      expect(setDoc).toHaveBeenCalledTimes(2);
    });

    it('another account on the device writes its own receipt', async () => {
      await markGroupMessageRead('org-two', 'm1', 'u1');
      await markGroupMessageRead('org-two', 'm1', 'u2');
      expect(setDoc).toHaveBeenCalledTimes(2);
    });
  });
});
