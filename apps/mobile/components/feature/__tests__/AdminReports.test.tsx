import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AdminReportsScreen from '../../../app/admin/denuncias';
import VillageReportsScreen from '../../../app/[pueblo]/denuncias';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/village/useActiveVillageId', () => ({ useActiveVillageId: () => 'mun1' }));
jest.mock('../../../lib/navigation/VillageRouteGate', () => ({
  useVillageRoute: () => ({ municipalityId: 'mun1', slug: 'villa', name: 'Villa' }),
  withVillageRoute: (Screen: unknown) => Screen,
}));
let mockCanManage = true;
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: () => ({ canManage: mockCanManage, loading: false }),
}));
const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({ Redirect: (props: { href: string }) => mockRedirect(props) }));
jest.mock('../../layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../LiveOwnerChip', () => ({ LiveOwnerChip: () => null }));
const report = (id: string, targetText: string | null, targetId = `organizations/o1/chat/${id}`, targetKind = 'comment') => ({
  id, municipalityId: 'mun1', targetKind, targetId, targetAuthorUserId: null,
  reporterUserId: 'u1', reason: 'harassment', note: null, targetText, status: 'open', createdAt: new Date(),
});
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  getReportsByMunicipality: () =>
    Promise.resolve([report('r1', 'Eres un idiota'), report('r2', null), report('r3', 'Copia del denunciante', 'comment1'), report('r4', null, 'term1', 'vocabularyTerm')]),
  setReportStatus: (...args: unknown[]) => mockSetReportStatus(...args),
}));
const mockSetReportStatus = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockGetComment = jest.fn();
const mockDeleteComment = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@cultuvilla/shared/services/commentsService', () => ({
  getComment: (...args: unknown[]) => mockGetComment(...args),
  deleteComment: (...args: unknown[]) => mockDeleteComment(...args),
}));
const mockDeleteMessage = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@cultuvilla/shared/services/groupChatService', () => ({
  deleteGroupChatMessage: (...args: unknown[]) => mockDeleteMessage(...args),
}));

describe('AdminReportsScreen', () => {
  it('shows the words of a report that carries them, since a chat is closed to its moderators', async () => {
    const r = render(<AdminReportsScreen />);
    await waitFor(() => expect(r.getByTestId('admin-report-text-r1')).toHaveTextContent('Eres un idiota'));
    expect(r.queryByTestId('admin-report-text-r2')).toBeNull();
  });

  function confirmDelete() {
    const spy = jest.spyOn(Alert, 'alert');
    return () => {
      const buttons = spy.mock.calls.at(-1)?.[2];
      buttons?.[1]?.onPress?.();
      spy.mockRestore();
    };
  }

  it('deletes a reported chat message and closes its report', async () => {
    const r = render(<AdminReportsScreen />);
    const accept = confirmDelete();
    fireEvent.press(await r.findByTestId('admin-report-delete-r1'));
    expect(mockDeleteMessage).not.toHaveBeenCalled();
    act(() => accept());
    await waitFor(() => expect(mockDeleteMessage).toHaveBeenCalledWith('o1', 'general', 'r1'));
    await waitFor(() => expect(mockSetReportStatus).toHaveBeenCalledWith('r1', 'reviewed'));
  });

  it('confirms a reported comment with its real words, not the copy in the report', async () => {
    mockGetComment.mockResolvedValueOnce({ id: 'comment1', municipalityId: 'mun1', body: 'Lo que dice de verdad' });
    const spy = jest.spyOn(Alert, 'alert');
    const r = render(<AdminReportsScreen />);
    fireEvent.press(await r.findByTestId('admin-report-delete-r3'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [title, body, buttons] = spy.mock.calls.at(-1) ?? [];
    expect(title).toBe('admin.reports.confirmDeleteCommentTitle');
    expect(body).toBe('Lo que dice de verdad');
    expect(mockDeleteComment).not.toHaveBeenCalled();
    act(() => buttons?.[1]?.onPress?.());
    await waitFor(() => expect(mockDeleteComment).toHaveBeenCalledWith('comment1'));
    await waitFor(() => expect(mockSetReportStatus).toHaveBeenCalledWith('r3', 'reviewed'));
    spy.mockRestore();
  });

  it.each([
    ['is gone', null],
    ['belongs to another village', { id: 'comment1', municipalityId: 'mun2', body: 'Otro pueblo' }],
  ])('deletes nothing when the reported comment %s', async (_name, comment) => {
    mockDeleteComment.mockClear();
    mockGetComment.mockResolvedValueOnce(comment);
    const spy = jest.spyOn(Alert, 'alert');
    const r = render(<AdminReportsScreen />);
    fireEvent.press(await r.findByTestId('admin-report-delete-r3'));
    await waitFor(() => expect(spy.mock.calls.at(-1)?.[0]).toBe('admin.reports.deleteCommentError'));
    expect(mockDeleteComment).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('offers no delete for a report of anything but a message or a comment', async () => {
    const r = render(<AdminReportsScreen />);
    await r.findByTestId('admin-report-delete-r1');
    expect(r.queryByTestId('admin-report-delete-r4')).toBeNull();
  });

  it('names what was reported instead of showing its internal path', async () => {
    const r = render(<AdminReportsScreen />);
    await r.findByTestId('admin-report-delete-r1');
    expect(r.getByText('admin.reports.kind.vocabularyTerm')).toBeTruthy();
    expect(r.getAllByText('admin.reports.kind.chatMessage')).toHaveLength(2);
    expect(r.getByText('admin.reports.kind.comment')).toBeTruthy();
    expect(r.queryByText(/organizations\//)).toBeNull();
  });

  it("opens the pueblo's reports to its team", async () => {
    mockCanManage = true;
    const r = render(<VillageReportsScreen />);
    await r.findByTestId('admin-report-text-r1');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('sends anyone else back to the village', () => {
    mockCanManage = false;
    render(<VillageReportsScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa' });
  });
});
