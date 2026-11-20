import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AdminReportsScreen from '../../../app/admin/denuncias';
import VillageReportsScreen from '../../../app/[pueblo]/denuncias';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'moderator' } }) }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getMunicipality: (id: string) => Promise.resolve({ id, name: id === 'mun2' ? 'Otro Pueblo' : 'Villa' }),
}));
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
const report = (id: string, targetText: string | null, targetId = `organizations/o1/chat/${id}`, targetKind = 'comment', targetAuthorUserId: string | null = null) => ({
  id, municipalityId: 'mun1', targetKind, targetId, targetAuthorUserId,
  reporterUserId: 'u1', reason: 'harassment', note: null, targetText, status: 'open', createdAt: new Date(),
});
// r6 is a comment the signed-in moderator wrote; r7 sits in another pueblo.
const mockReports = () => [report('r1', 'Eres un idiota'), report('r2', null), report('r3', 'Copia del denunciante', 'comment1'), report('r4', null, 'term1', 'vocabularyTerm'), report('r5', 'Te espero a las 3', 'cosaRequests/q1/chat/m1'), report('r6', 'Lo mío', 'comment6', 'comment', 'moderator')];
const mockGetReportsByMunicipality = jest.fn((..._args: unknown[]) => Promise.resolve(mockReports()));
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  getReportsByMunicipality: (...args: unknown[]) => mockGetReportsByMunicipality(...args),
  getOpenReports: () => Promise.resolve([...mockReports(), { ...report('r7', 'De otro pueblo', 'news7', 'news'), municipalityId: 'mun2' }]),
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
const mockDeleteCosaMessage = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({
  deleteCosaRequestChatMessage: (...args: unknown[]) => mockDeleteCosaMessage(...args),
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

  it("deletes a reported message of a cosa request's chat and closes its report", async () => {
    mockDeleteMessage.mockClear();
    const r = render(<AdminReportsScreen />);
    const accept = confirmDelete();
    fireEvent.press(await r.findByTestId('admin-report-delete-r5'));
    act(() => accept());
    await waitFor(() => expect(mockDeleteCosaMessage).toHaveBeenCalledWith('q1', 'm1'));
    expect(mockDeleteMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(mockSetReportStatus).toHaveBeenCalledWith('r5', 'reviewed'));
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
    expect(r.getAllByText('admin.reports.kind.chatMessage')).toHaveLength(3);
    expect(r.getAllByText('admin.reports.kind.comment')).toHaveLength(2);
    expect(r.queryByText(/organizations\//)).toBeNull();
    expect(r.queryByText(/cosaRequests\//)).toBeNull();
  });

  it('lists every village for an app admin, naming the pueblo on each row', async () => {
    mockGetReportsByMunicipality.mockClear();
    const r = render(<AdminReportsScreen />);
    await waitFor(() => expect(r.getByTestId('admin-report-village-r7')).toHaveTextContent('Otro Pueblo'));
    expect(r.getByTestId('admin-report-village-r1')).toHaveTextContent('Villa');
    expect(mockGetReportsByMunicipality).not.toHaveBeenCalled();
  });

  it('offers no way to resolve a report about your own content, and says why', async () => {
    const r = render(<AdminReportsScreen />);
    expect(await r.findByTestId('admin-report-own-r6')).toHaveTextContent('admin.reports.ownContent');
    expect(r.queryByTestId('admin-report-delete-r6')).toBeNull();
    expect(r.queryByTestId('admin-report-dismiss-r6')).toBeNull();
    expect(r.queryByTestId('admin-report-reviewed-r6')).toBeNull();
    expect(r.getByTestId('admin-report-dismiss-r1')).toBeTruthy();
    expect(r.queryByTestId('admin-report-own-r1')).toBeNull();
  });

  it("opens the pueblo's reports to its team, without naming the pueblo", async () => {
    mockGetReportsByMunicipality.mockClear();
    mockCanManage = true;
    const r = render(<VillageReportsScreen />);
    await r.findByTestId('admin-report-text-r1');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockGetReportsByMunicipality).toHaveBeenCalledWith('mun1', { status: 'open' });
    expect(r.queryByTestId('admin-report-village-r1')).toBeNull();
    expect(r.queryByTestId('admin-report-dismiss-r6')).toBeNull();
  });

  it('sends anyone else back to the village', () => {
    mockCanManage = false;
    render(<VillageReportsScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/villa' });
  });
});
