import { render, waitFor } from '@testing-library/react-native';
import AdminReportsScreen from '../../../app/admin/denuncias';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/village/useActiveVillageId', () => ({ useActiveVillageId: () => 'mun1' }));
jest.mock('../../layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../LiveOwnerChip', () => ({ LiveOwnerChip: () => null }));
const report = (id: string, targetText: string | null) => ({
  id, municipalityId: 'mun1', targetKind: 'comment', targetId: `organizations/o1/chat/${id}`, targetAuthorUserId: null,
  reporterUserId: 'u1', reason: 'harassment', note: null, targetText, status: 'open', createdAt: new Date(),
});
jest.mock('@cultuvilla/shared/services/contentReportService', () => ({
  getReportsByMunicipality: () => Promise.resolve([report('r1', 'Eres un idiota'), report('r2', null)]),
  setReportStatus: jest.fn(),
}));

describe('AdminReportsScreen', () => {
  it('shows the words of a report that carries them, since a chat is closed to its moderators', async () => {
    const r = render(<AdminReportsScreen />);
    await waitFor(() => expect(r.getByTestId('admin-report-text-r1')).toHaveTextContent('Eres un idiota'));
    expect(r.queryByTestId('admin-report-text-r2')).toBeNull();
  });
});
