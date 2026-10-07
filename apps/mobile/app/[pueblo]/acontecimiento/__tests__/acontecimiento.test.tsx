import { render, waitFor } from '@testing-library/react-native';
import { resetWatchers, setWatched, watchersOf } from '../../../../test/watchers';
import HistoryEntryDetailScreen from '../[acontecimiento]';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', acontecimiento: 'carta-puebla_h1' }),
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() },
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('../../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('@cultuvilla/shared/services/historyService', () => ({
  watchHistoryEntry: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('entry'),
}));
jest.mock('../../../../components/primitives/NaturalImage', () => ({ NaturalImage: () => null }));
jest.mock('../../../../components/feature/EntityComments', () => ({ EntityComments: () => null }));
jest.mock('../../../../components/feature/RichText', () => ({
  RichText: jest.fn(({ text }: { text: string }) => {
    const { Text } = require('react-native');
    return <Text>{text}</Text>;
  }),
}));
jest.mock('@cultuvilla/shared/services/commentsService', () => ({
  recordEntityView: jest.fn().mockResolvedValue(undefined),
}));

import { RichText } from '../../../../components/feature/RichText';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';

const ENTRY = {
  id: 'h1',
  municipalityId: 'm1',
  villageSlug: 'villa',
  createdBy: 'author',
  title: 'Carta puebla',
  body: { text: 'El rey concede fueros al concejo.', mentions: [], links: [], marks: [] },
  images: [
    { url: 'https://example.com/a.jpg', caption: 'Pergamino original' },
    { url: 'https://example.com/b.jpg', caption: null },
  ],
  start: { year: 1212, month: null, day: null },
  end: null,
  approximate: true,
  sources: 'Archivo Histórico Provincial. https://bvpb.mcu.es/registro?id=397371',
  status: 'active',
};

function mockCaps(canEdit: boolean) {
  (useEntityCapabilities as jest.Mock).mockReturnValue({
    canManage: false,
    uid: 'u1',
    loading: false,
    canEdit: jest.fn(() => canEdit),
    canDelete: jest.fn(() => canEdit),
  });
}

describe('HistoryEntryDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWatchers();
    setWatched('entry', ENTRY);
  });

  it('renders the title, loose date, article, caption and sources', async () => {
    mockCaps(false);
    const { getByText } = render(<HistoryEntryDetailScreen />);
    await waitFor(() => getByText('Carta puebla'));
    expect(getByText('h. 1212')).toBeTruthy();
    expect(getByText('El rey concede fueros al concejo.')).toBeTruthy();
    expect(getByText('Pergamino original')).toBeTruthy();
    expect(getByText('Archivo Histórico Provincial. https://bvpb.mcu.es/registro?id=397371')).toBeTruthy();
    expect(watchersOf('entry')[0]?.args).toEqual(['h1']);
  });

  it('renders the sources through RichText, so a URL cited there is tappable', async () => {
    mockCaps(false);
    const { getByText } = render(<HistoryEntryDetailScreen />);
    await waitFor(() => getByText('Carta puebla'));
    const rendered = (RichText as unknown as jest.Mock).mock.calls.map((call) => call[0].text);
    expect(rendered).toContain('Archivo Histórico Provincial. https://bvpb.mcu.es/registro?id=397371');
  });

  it('lets anyone share it', async () => {
    mockCaps(false);
    const { findByLabelText } = render(<HistoryEntryDetailScreen />);
    expect(await findByLabelText('deeplink.shareViewLabel')).toBeTruthy();
  });

  it('shows the edit action only to someone who may edit', async () => {
    mockCaps(true);
    const { findByLabelText } = render(<HistoryEntryDetailScreen />);
    expect(await findByLabelText('common.edit')).toBeTruthy();
  });

  it('hides the edit action from an unrelated viewer', async () => {
    mockCaps(false);
    const { getByText, queryByLabelText } = render(<HistoryEntryDetailScreen />);
    await waitFor(() => getByText('Carta puebla'));
    expect(queryByLabelText('common.edit')).toBeNull();
  });
});
