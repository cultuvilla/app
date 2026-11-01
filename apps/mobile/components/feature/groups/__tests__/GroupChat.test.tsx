import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import { emitWatched, resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupChat } from '../GroupChat';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 40, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useAuth', () => ({ useAuth: () => ({ profile: { displayName: 'Ana' } }) }));
const mockSend = jest.fn((_input: unknown) => Promise.resolve('new1'));
const mockDelete = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockMarkRead = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockSetPush = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('@cultuvilla/shared/services/groupChatService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchGroupChat: mockWatcher('chat'),
    sendGroupChatMessage: (input: unknown) => mockSend(input),
    deleteGroupChatMessage: (...a: unknown[]) => mockDelete(...a),
    markGroupChatRead: (...a: unknown[]) => mockMarkRead(...a),
    setGroupChatPush: (...a: unknown[]) => mockSetPush(...a),
  };
});
jest.mock('@cultuvilla/shared/services/groupMessageService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return { watchGroupNotificationPrefs: mockWatcher('prefs') };
});
let mockBlocked: string[] = [];
jest.mock('@cultuvilla/shared/services/blockedUserService', () => ({
  getBlockedUserIds: () => Promise.resolve(mockBlocked),
  blockUser: jest.fn(() => Promise.resolve()),
}));
const mockReport = jest.fn((_input: unknown) => Promise.resolve('r1'));
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  createContentReport: (input: unknown) => mockReport(input),
}));
const mockConfirm = jest.fn((_title: string, _body: string, onConfirm: () => void) => onConfirm());
const mockAlert = jest.fn();
jest.mock('../../../../lib/dialogs', () => ({
  showAlert: (m: string) => mockAlert(m),
  showConfirm: (title: string, body: string, onConfirm: () => void) => mockConfirm(title, body, onConfirm),
}));
jest.mock('../../../../lib/firestoreErrorLog', () => ({ reportWatchError: jest.fn(), reportWatchStall: jest.fn() }));

const message = (id: string, authorUid: string, over: Record<string, unknown> = {}) => ({
  id,
  authorUid,
  authorName: authorUid === 'u1' ? 'Ana' : 'Paco',
  body: `Mensaje ${id}`,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  ...over,
});

const chat = (props: Partial<Parameters<typeof GroupChat>[0]> = {}) =>
  render(<GroupChat orgId="org1" municipalityId="mun1" threadId="general" uid="u1" canModerate={false} {...props} />);

beforeEach(() => {
  jest.clearAllMocks();
  resetWatchers();
  mockBlocked = [];
  setWatched('prefs', null);
});

describe('GroupChat', () => {
  it('shows each message with its author and marks the thread read, again when a new one lands', async () => {
    setWatched('chat', [message('c1', 'paco')]);
    const r = chat();
    await waitFor(() => expect(r.getByText('Mensaje c1')).toBeTruthy());
    expect(r.getByText('Paco')).toBeTruthy();
    expect(r.getByTestId('group-chat-list')).toBeTruthy();
    expect(r.getByTestId('group-chat-message-c1')).toBeTruthy();
    expect(mockMarkRead).toHaveBeenCalledWith('org1', 'general', 'u1');
    const reads = mockMarkRead.mock.calls.length;
    emitWatched('chat', [message('c2', 'paco'), message('c1', 'paco')]);
    await waitFor(() => expect(mockMarkRead.mock.calls.length).toBe(reads + 1));
  });

  it('sends as the signed-in member under their name and clears the field', async () => {
    setWatched('chat', []);
    const r = chat();
    expect(r.queryByTestId('group-chat-send')).toBeNull();
    fireEvent.changeText(r.getByTestId('group-chat-input'), '  Hola  ');
    fireEvent.press(r.getByTestId('group-chat-send'));
    expect(mockSend).toHaveBeenCalledWith({ orgId: 'org1', threadId: 'general', uid: 'u1', authorName: 'Ana', body: 'Hola' });
    await waitFor(() => expect(r.getByTestId('group-chat-input').props.value).toBe(''));
  });

  it('gives the text back when the send fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('denied'));
    setWatched('chat', []);
    const r = chat();
    fireEvent.changeText(r.getByTestId('group-chat-input'), 'Hola');
    fireEvent.press(r.getByTestId('group-chat-send'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('groups.chat.sendError'));
    expect(r.getByTestId('group-chat-input').props.value).toBe('Hola');
  });

  it('says when a thread is empty, and when it could not be read', () => {
    setWatched('chat', []);
    const empty = chat();
    expect(empty.getByTestId('group-chat-empty')).toBeTruthy();
    empty.unmount();
    setWatched('chat', new Error('offline'));
    expect(chat().getByTestId('group-chat-error')).toBeTruthy();
  });

  it('says why in place of the composer when only the junta writes', () => {
    setWatched('chat', []);
    const r = chat({ closedHint: 'solo la junta' });
    expect(r.getByTestId('group-chat-closed')).toBeTruthy();
    expect(r.queryByTestId('group-chat-input')).toBeNull();
  });

  it('hides the messages of people the viewer blocked', async () => {
    mockBlocked = ['troll'];
    setWatched('chat', [message('c1', 'paco'), message('c2', 'troll')]);
    const r = chat();
    await waitFor(() => expect(r.queryByText('Mensaje c2')).toBeNull());
    expect(r.getByText('Mensaje c1')).toBeTruthy();
  });

  it('lets the author delete their message, and not report it', async () => {
    setWatched('chat', [message('c1', 'u1')]);
    const r = chat();
    expect(r.queryByTestId('group-chat-options')).toBeNull();
    fireEvent.press(r.getByTestId('group-chat-options-c1'));
    expect(r.getByTestId('group-chat-options')).toBeTruthy();
    expect(r.queryByTestId('group-chat-options-report')).toBeNull();
    fireEvent.press(r.getByTestId('group-chat-options-delete'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('org1', 'general', 'c1'));
  });

  it('offers a plain member no delete on someone else’s message, an admin one', () => {
    setWatched('chat', [message('c1', 'paco')]);
    const member = chat();
    fireEvent.press(member.getByTestId('group-chat-options-c1'));
    expect(member.queryByTestId('group-chat-options-delete')).toBeNull();
    member.unmount();
    const admin = chat({ canModerate: true });
    fireEvent.press(admin.getByTestId('group-chat-options-c1'));
    expect(admin.getByTestId('group-chat-options-delete')).toBeTruthy();
  });

  it('a report names the message and carries its text, for moderators who cannot open the chat', async () => {
    setWatched('chat', [message('c1', 'paco')]);
    const r = chat({ threadId: 'aviso1' });
    fireEvent.press(r.getByTestId('group-chat-options-c1'));
    fireEvent.press(r.getByTestId('group-chat-options-report'));
    await act(async () => {
      fireEvent.press(await r.findByTestId('report-reason-harassment'));
    });
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({
        municipalityId: 'mun1',
        targetKind: 'comment',
        targetId: 'organizations/org1/messages/aviso1/chat/c1',
        targetAuthorUserId: 'paco',
        targetText: 'Mensaje c1',
        reporterUserId: 'u1',
        reason: 'harassment',
      }),
    );
  });

  it('the notification switch is off until turned on, and keeps the group’s mute', async () => {
    setWatched('chat', []);
    setWatched('prefs', { messagesMuted: true, chatPush: false, orgId: 'org1', updatedAt: new Date() });
    const r = chat();
    expect(r.getByTestId('group-chat-push').props.accessibilityState.checked).toBe(false);
    fireEvent.press(r.getByTestId('group-chat-push'));
    await waitFor(() =>
      expect(mockSetPush).toHaveBeenCalledWith('u1', 'org1', true, expect.objectContaining({ messagesMuted: true })),
    );
  });

  it('on Android lifts the composer by the bars the keyboard padding leaves out, only while the keyboard is up', () => {
    const os = Platform.OS;
    Platform.OS = 'android';
    const listeners: Record<string, () => void> = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners[event] = cb;
      return { remove: jest.fn() };
    }) as never);
    setWatched('chat', []);
    const r = chat();
    const gap = () => StyleSheet.flatten(r.getByTestId('group-chat-composer').props.style).marginBottom;
    expect(gap()).toBe(0);
    act(() => listeners.keyboardDidShow?.());
    expect(gap()).toBe(64);
    act(() => listeners.keyboardDidHide?.());
    expect(gap()).toBe(0);
    spy.mockRestore();
    Platform.OS = os;
  });
});
