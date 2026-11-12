import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
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
const mockReact = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock('@cultuvilla/shared/services/groupChatService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchGroupChat: mockWatcher('chat'),
    sendGroupChatMessage: (input: unknown) => mockSend(input),
    deleteGroupChatMessage: (...a: unknown[]) => mockDelete(...a),
    markGroupChatRead: (...a: unknown[]) => mockMarkRead(...a),
    setGroupChatReaction: (...a: unknown[]) => mockReact(...a),
  };
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
    expect(r.queryByTestId('group-chat-sheet')).toBeNull();
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
    expect(r.getByTestId('group-chat-sheet')).toBeTruthy();
    expect(r.queryByTestId('group-chat-options-report')).toBeNull();
    fireEvent.press(r.getByTestId('group-chat-options-delete'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('org1', 'general', 'c1'));
  });

  it('offers a plain member no delete on someone else’s message, an admin one', () => {
    setWatched('chat', [message('c1', 'paco')]);
    const member = chat();
    fireEvent(member.getByTestId('group-chat-message-c1'), 'longPress');
    expect(member.queryByTestId('group-chat-options-delete')).toBeNull();
    member.unmount();
    const admin = chat({ canModerate: true });
    fireEvent(admin.getByTestId('group-chat-message-c1'), 'longPress');
    expect(admin.getByTestId('group-chat-options-delete')).toBeTruthy();
  });

  it('a report names the message and carries its text, for moderators who cannot open the chat', async () => {
    setWatched('chat', [message('c1', 'paco')]);
    const r = chat({ threadId: 'aviso1' });
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
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

  it('draws one author’s consecutive messages under one name and initial, the viewer’s own with neither', async () => {
    setWatched('chat', [
      message('c4', 'u1', { createdAt: new Date(2026, 10, 2, 12) }),
      message('c3', 'paco', { createdAt: new Date(2026, 10, 2, 11) }),
      message('c2', 'paco', { createdAt: new Date(2026, 10, 2, 10) }),
      message('c1', 'paco', { createdAt: new Date(2026, 10, 1, 10) }),
    ]);
    const r = chat();
    await waitFor(() => expect(r.getByText('Mensaje c4')).toBeTruthy());
    // Paco on 1 Nov, then again on 2 Nov: a new day opens a new run.
    expect(r.getAllByText('Paco')).toHaveLength(2);
    expect(r.getByTestId('group-chat-initial-c1')).toBeTruthy();
    expect(r.getByTestId('group-chat-initial-c2')).toBeTruthy();
    expect(r.queryByTestId('group-chat-initial-c3')).toBeNull();
    expect(r.queryByTestId('group-chat-initial-c4')).toBeNull();
    expect(r.queryByText('Ana')).toBeNull();
  });

  it('separates the days', async () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    setWatched('chat', [message('c2', 'paco', { createdAt: now }), message('c1', 'paco', { createdAt: yesterday })]);
    const r = chat();
    await waitFor(() => expect(r.getByText('groups.chat.today')).toBeTruthy());
    expect(r.getByText('groups.chat.yesterday')).toBeTruthy();
  });

  it('replies quoting the message, and can drop the quote before sending', async () => {
    setWatched('chat', [message('c1', 'paco')]);
    const r = chat();
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
    fireEvent.press(r.getByTestId('group-chat-options-reply'));
    expect(r.getByTestId('group-chat-replying')).toBeTruthy();
    fireEvent.press(r.getByTestId('group-chat-reply-cancel'));
    expect(r.queryByTestId('group-chat-replying')).toBeNull();
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
    fireEvent.press(r.getByTestId('group-chat-options-reply'));
    fireEvent.changeText(r.getByTestId('group-chat-input'), 'Yo');
    fireEvent.press(r.getByTestId('group-chat-send'));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Yo', replyTo: expect.objectContaining({ id: 'c1', authorUid: 'paco', body: 'Mensaje c1' }) }),
    );
    await waitFor(() => expect(r.queryByTestId('group-chat-replying')).toBeNull());
  });

  it('copies the message text from the long-press', () => {
    setWatched('chat', [message('c1', 'paco')]);
    const r = chat();
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
    fireEvent.press(r.getByTestId('group-chat-options-copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Mensaje c1');
    expect(r.queryByTestId('group-chat-sheet')).toBeNull();
  });

  it('shows the quote a reply carries', async () => {
    setWatched('chat', [message('c2', 'u1', { replyTo: { chatId: 'c1', authorUid: 'paco', authorName: 'Paco', body: '¿Quién trae la tostadora?' } })]);
    const r = chat();
    await waitFor(() => expect(r.getByText('¿Quién trae la tostadora?')).toBeTruthy());
  });

  it('reacts from the long-press, and a tap on the reaction you left takes it back', async () => {
    setWatched('chat', [message('c1', 'paco', { reactions: { u1: '👍', paco: '👍', pepa: '❤️' } })]);
    const r = chat();
    await waitFor(() => expect(r.getByText('👍 2')).toBeTruthy());
    expect(r.getByText('❤️')).toBeTruthy();
    fireEvent.press(r.getByTestId('group-chat-reaction-c1-👍'));
    expect(mockReact).toHaveBeenLastCalledWith('org1', 'general', 'c1', 'u1', null);
    fireEvent.press(r.getByTestId('group-chat-reaction-c1-❤️'));
    expect(mockReact).toHaveBeenLastCalledWith('org1', 'general', 'c1', 'u1', '❤️');
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
    expect(r.getByTestId('group-chat-sheet-text')).toBeTruthy();
    fireEvent.press(r.getByTestId('group-chat-react-🙏'));
    expect(mockReact).toHaveBeenLastCalledWith('org1', 'general', 'c1', 'u1', '🙏');
    expect(r.queryByTestId('group-chat-sheet')).toBeNull();
  });

  it('says so when a reaction is not saved', async () => {
    mockReact.mockRejectedValueOnce(new Error('denied'));
    setWatched('chat', [message('c1', 'paco')]);
    const r = chat();
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
    fireEvent.press(r.getByTestId('group-chat-react-😂'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('groups.chat.reactError'));
  });

  it('where only the junta writes, a member still reacts but does not reply', () => {
    setWatched('chat', [message('c1', 'paco')]);
    const r = chat({ closedHint: 'solo la junta' });
    fireEvent(r.getByTestId('group-chat-message-c1'), 'longPress');
    expect(r.queryByTestId('group-chat-options-reply')).toBeNull();
    fireEvent.press(r.getByTestId('group-chat-react-😮'));
    expect(mockReact).toHaveBeenCalledWith('org1', 'general', 'c1', 'u1', '😮');
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
