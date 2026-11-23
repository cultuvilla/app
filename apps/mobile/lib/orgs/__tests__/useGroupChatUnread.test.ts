import { renderHook } from '@testing-library/react-native';
import { resetWatchers, setWatched } from '../../../test/watchers';
import { useGroupChatUnread } from '../useGroupChatUnread';

jest.mock('@cultuvilla/shared/services/groupChatService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers');
  return { watchGroupChatThreads: mockWatcher('threads'), watchMyGroupChatReads: mockWatcher('reads') };
});
jest.mock('../../firestoreErrorLog', () => ({ reportWatchError: jest.fn(), reportWatchStall: jest.fn() }));

const t = (min: number) => new Date(Date.UTC(2026, 10, 1, 10, min));
const IDS = ['a1', 'a2'];

beforeEach(() => {
  resetWatchers();
});

describe('useGroupChatUnread', () => {
  it('reports the general chat and each aviso apart', () => {
    setWatched('threads', [
      { id: 'general', lastMessageAt: t(5), lastAuthorUid: 'paco' },
      { id: 'a1', lastMessageAt: t(5), lastAuthorUid: 'paco' },
      { id: 'a2', lastMessageAt: t(5), lastAuthorUid: 'paco' },
    ]);
    setWatched('reads', [{ id: 'a1', readAt: t(9) }]);
    const { result } = renderHook(() => useGroupChatUnread('org1', 'u1', IDS));
    expect(result.current.generalUnread).toBe(true);
    expect([...result.current.unreadAvisoIds]).toEqual(['a2']);
  });

  it('shows nothing until the reads load, so a thread never flashes as unread', () => {
    setWatched('threads', [{ id: 'general', lastMessageAt: t(5), lastAuthorUid: 'paco' }]);
    const { result } = renderHook(() => useGroupChatUnread('org1', 'u1', IDS));
    expect(result.current.generalUnread).toBe(false);
  });

  it('a thread nobody wrote in, and one whose last word is yours, are read', () => {
    setWatched('threads', [{ id: 'general', lastMessageAt: t(5), lastAuthorUid: 'u1' }]);
    setWatched('reads', []);
    const { result } = renderHook(() => useGroupChatUnread('org1', 'u1', IDS));
    expect(result.current.generalUnread).toBe(false);
    expect(result.current.unreadAvisoIds.size).toBe(0);
  });
});
