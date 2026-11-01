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
const report = (id: string, targetText: string | null, targetId = `organizations/o1/chat/${id}`) => ({
  id, municipalityId: 'mun1', targetKind: 'comment', targetId, targetAuthorUserId: null,
  reporterUserId: 'u1', reason: 'harassment', note: null, targetText, status: 'open', createdAt: new Date(),
});
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  getReportsByMunicipality: () =>
    Promise.resolve([report('r1', 'Eres un idiota'), report('r2', null), report('r3', null, 'comment1')]),
  setReportStatus: (...args: unknown[]) => mockSetReportStatus(...args),
}));
const mockSetReportStatus = jest.fn((..._args: unknown[]) => Promise.resolve());
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

  it('offers no delete for a report of anything but a chat message', async () => {
    const r = render(<AdminReportsScreen />);
    await r.findByTestId('admin-report-delete-r1');
    expect(r.queryByTestId('admin-report-delete-r3')).toBeNull();
  });

  it('names what was reported instead of showing its internal path', async () => {
    const r = render(<AdminReportsScreen />);
    await r.findByTestId('admin-report-delete-r1');
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
