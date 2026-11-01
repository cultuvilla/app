import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupNotices } from '../GroupNotices';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('../../../../lib/orgs/useGroupChatUnread', () => ({
  useGroupChatUnread: () => ({ generalUnread: false, unreadAvisoIds: new Set(['chatty']) }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
const mockValues = { nombre: null as string | null, numero: null as number | null, cuotaCents: null as number | null };
jest.mock('../../../../lib/orgs/useMyMessageValues', () => ({ useMyMessageValues: () => mockValues }));
const mockMarkRead = jest.fn(() => Promise.resolve());
const mockVote = jest.fn(() => Promise.resolve());
jest.mock('@cultuvilla/shared/services/groupMessageService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchMyGroupMessages: mockWatcher('messages'),
    watchMyGroupMessageReads: mockWatcher('reads'),
    watchMyGroupPollVotes: mockWatcher('votes'),
    markGroupMessageRead: (...a: unknown[]) => mockMarkRead(...(a as [])),
    castGroupPollVote: (...a: unknown[]) => mockVote(...(a as [])),
  };
});

const message = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `T-${id}`,
  body: `Body ${id}`,
  audience: { kind: 'all', eventId: null, eventTitle: null },
  channels: { push: true, email: true, whatsapp: 'none' },
  pinned: false,
  poll: null,
  recipientUids: ['admin', 'u1'],
  recipientCount: 2,
  pushCount: 1,
  emailCount: 1,
  whatsappCount: 0,
  sentBy: 'admin',
  signerName: 'Luis',
  signerTitle: null,
  sentAt: new Date('2026-10-20T10:00:00Z'),
  nudgeCount: 0,
  lastNudgedAt: null,
  ...over,
});

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  setWatched('votes', []);
});

describe('GroupNotices', () => {
  it('shows nothing while no message reached the member', () => {
    setWatched('messages', []);
    const { queryByTestId } = render(<GroupNotices orgId="org1" uid="u1" />);
    expect(queryByTestId('group-notices')).toBeNull();
  });

  it("shows the reader's own values in place of the placeholders, and drops what they lack", () => {
    mockValues.nombre = 'Ana';
    setWatched('messages', [message('p', { title: 'Hola {nombre}', body: 'Hola {nombre}.\nTu nº es {nº socio}.\nHay cena.' })]);
    setWatched('reads', []);
    const { getByText, queryByText } = render(<GroupNotices orgId="org1" uid="u1" />);
    mockValues.nombre = null;
    expect(getByText('Hola Ana')).toBeTruthy();
    expect(getByText('Hola Ana.\nHay cena.')).toBeTruthy();
    expect(queryByText(/\{/)).toBeNull();
  });

  it('lists newest first, with no pinned or sender line, and marks the unread ones read once shown', async () => {
    setWatched('messages', [message('old', { pinned: true, sentAt: new Date('2026-01-01') }), message('new')]);
    setWatched('reads', [{ id: 'old', readAt: new Date() }]);
    const { getAllByTestId, getByTestId } = render(<GroupNotices orgId="org1" uid="u1" />);
    expect(getAllByTestId(/^group-notice-(new|old)$/).map((n) => n.props.testID)).toEqual(['group-notice-new', 'group-notice-old']);
    expect(getByTestId('group-notice-new')).toHaveTextContent(/groups\.messages\.newBadge/);
    expect(getByTestId('group-notice-old')).not.toHaveTextContent(/groups\.messages\.(pinnedBadge|sentBy)|Luis/);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('org1', 'new', 'u1'));
    expect(mockMarkRead).toHaveBeenCalledTimes(1);
  });

  it('answers a poll with one tap and shows the answer', () => {
    setWatched('messages', [message('p', { poll: { question: '¿12 o 19?', kind: 'choice', options: ['12', '19'] } })]);
    setWatched('reads', [{ id: 'p', readAt: new Date() }]);
    setWatched('votes', [{ id: 'p', option: 1, votedAt: new Date() }]);
    const { getByTestId } = render(<GroupNotices orgId="org1" uid="u1" />);
    expect(getByTestId('group-notice-poll-p')).toHaveTextContent(/groups\.messages\.yourVote:19/);
    fireEvent.press(getByTestId('group-notice-vote-p-0'));
    expect(mockVote).toHaveBeenCalledWith('org1', 'p', 'u1', 0);
  });

  it('each notice opens its conversation, and says when it has something new', () => {
    setWatched('messages', [message('quiet'), message('chatty')]);
    setWatched('reads', []);
      const r = render(<GroupNotices orgId="org1" uid="u1" />);
    expect(r.getByText('groups.chat.openNew')).toBeTruthy();
    expect(r.getByText('groups.chat.open')).toBeTruthy();
    fireEvent.press(r.getByTestId('group-notice-open-quiet'));
    fireEvent.press(r.getByTestId('group-notice-chat-quiet'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/org1/aviso/quiet');
  });
});
