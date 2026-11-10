import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { latestWatcher, resetWatchers, setWatched } from '../../../../test/watchers';
import { CosaRequestChat } from '../cosateca/CosaRequestChat';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
const mockSend = jest.fn((_input: unknown) => Promise.resolve('new1'));
const mockDelete = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('@cultuvilla/shared/services/cosatecaService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchCosaRequestChat: mockWatcher('chat'),
    sendCosaRequestChatMessage: (input: unknown) => mockSend(input),
    deleteCosaRequestChatMessage: (...a: unknown[]) => mockDelete(...a),
  };
});
jest.mock('@cultuvilla/shared/services/userService', () => ({
  getPublicProfile: () => Promise.resolve({ displayName: 'Ana' }),
}));
let mockBlocked: string[] = [];
jest.mock('@cultuvilla/shared/services/blockedUserService', () => ({
  getBlockedUserIds: () => Promise.resolve(mockBlocked),
  blockUser: jest.fn(() => Promise.resolve()),
}));
const mockReport = jest.fn((_input: unknown) => Promise.resolve('r1'));
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  createContentReport: (input: unknown) => mockReport(input),
}));
jest.mock('../../../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: (_title: string, _body: string, onConfirm: () => void) => onConfirm(),
}));
jest.mock('../../../../lib/firestoreErrorLog', () => ({ reportWatchError: jest.fn(), reportWatchStall: jest.fn() }));

const message = (id: string, authorUid: string, minute: number) => ({
  id,
  authorUid,
  authorName: authorUid === 'u1' ? 'Ana' : 'Luis',
  body: `Mensaje ${id}`,
  createdAt: new Date(`2026-11-01T10:${String(minute).padStart(2, '0')}:00Z`),
});

const chat = (canModerate = false) =>
  render(<CosaRequestChat requestId="r1" municipalityId="m1" uid="u1" canModerate={canModerate} />);

beforeEach(() => {
  jest.clearAllMocks();
  resetWatchers();
  mockBlocked = [];
});

describe('CosaRequestChat', () => {
  it('lists the messages oldest first and hides the ones from people the viewer blocked', async () => {
    mockBlocked = ['troll'];
    // The service answers newest first.
    setWatched('chat', [message('c3', 'troll', 3), message('c2', 'luis', 2), message('c1', 'u1', 1)]);
    const r = chat();
    await waitFor(() => expect(r.queryByTestId('cosa-request-chat-message-c3')).toBeNull());
    const ids = r.getAllByTestId(/^cosa-request-chat-message-/).map((n) => n.props.testID as string);
    expect(ids).toEqual(['cosa-request-chat-message-c1', 'cosa-request-chat-message-c2']);
  });

  it('says how to use it while empty, and sends under the public name', async () => {
    setWatched('chat', []);
    const r = chat();
    expect(r.getByTestId('cosa-request-chat-empty')).toBeTruthy();
    fireEvent.changeText(r.getByTestId('cosa-request-chat-input'), ' El sábado a las 10 ');
    fireEvent.press(r.getByTestId('cosa-request-chat-send'));
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({ requestId: 'r1', uid: 'u1', authorName: 'Ana', body: 'El sábado a las 10' }),
    );
    await waitFor(() => expect(r.getByTestId('cosa-request-chat-input').props.value).toBe(''));
  });

  it("lets the author delete their own message; a party no one else's; an admin anyone's", () => {
    setWatched('chat', [message('c2', 'luis', 2), message('c1', 'u1', 1)]);
    const r = chat();
    expect(r.getByTestId('cosa-request-chat')).toBeTruthy();
    fireEvent.press(r.getByTestId('cosa-request-chat-options-c1'));
    expect(r.getByTestId('cosa-request-chat-options')).toBeTruthy();
    expect(r.queryByTestId('cosa-request-chat-options-report')).toBeNull();
    fireEvent.press(r.getByTestId('cosa-request-chat-options-delete'));
    expect(mockDelete).toHaveBeenCalledWith('r1', 'c1');
    fireEvent.press(r.getByTestId('cosa-request-chat-options-c2'));
    expect(r.queryByTestId('cosa-request-chat-options-delete')).toBeNull();
    r.unmount();
    const admin = chat(true);
    fireEvent.press(admin.getByTestId('cosa-request-chat-options-c2'));
    expect(admin.getByTestId('cosa-request-chat-options-delete')).toBeTruthy();
  });

  it("reports a message by the request chat's path, with its text for the moderators", async () => {
    setWatched('chat', [message('c2', 'luis', 2)]);
    const r = chat();
    fireEvent.press(r.getByTestId('cosa-request-chat-options-c2'));
    fireEvent.press(r.getByTestId('cosa-request-chat-options-report'));
    await act(async () => {
      fireEvent.press(await r.findByTestId('report-reason-harassment'));
    });
    await waitFor(() =>
      expect(mockReport).toHaveBeenCalledWith(
        expect.objectContaining({
          targetKind: 'comment',
          targetId: 'cosaRequests/r1/chat/c2',
          municipalityId: 'm1',
          targetAuthorUserId: 'luis',
          targetText: 'Mensaje c2',
          reporterUserId: 'u1',
        }),
      ),
    );
  });

  it('asks for an older page once the first is full, and says so when it cannot load', () => {
    setWatched('chat', Array.from({ length: 50 }, (_, i) => message(`c${String(i)}`, 'luis', i % 60)));
    const r = chat();
    expect(latestWatcher('chat').args).toEqual(['r1', 50]);
    fireEvent.press(r.getByTestId('cosa-request-chat-older'));
    expect(latestWatcher('chat').args).toEqual(['r1', 100]);
    r.unmount();
    resetWatchers();
    setWatched('chat', new Error('permission-denied'));
    expect(chat().getByTestId('cosa-request-chat-error')).toBeTruthy();
  });
});
