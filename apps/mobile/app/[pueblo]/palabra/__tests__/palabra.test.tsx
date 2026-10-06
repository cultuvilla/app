import { render, waitFor } from '@testing-library/react-native';
import VocabularyTermScreen from '../[palabra]';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../../../test/watchers';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', palabra: 'miaja' }),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useAuth', () => {
  const value = { user: null };
  return { useAuth: () => value };
});
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: () => ({ canManage: false, isMember: false }),
}));
jest.mock('@cultuvilla/shared/services/vocabularyService', () => ({
  watchVocabularyTerm: jest
    .requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers')
    .mockWatcher('term'),
  watchVocabularyDefinitions: jest
    .requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers')
    .mockWatcher('definitions'),
  deleteVocabularyDefinition: jest.fn(),
  deleteVocabularyTerm: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/commentsService', () => ({
  recordEntityView: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../components/feature/EntityComments', () => ({ EntityComments: () => null }));
jest.mock('../../../../components/feature/EntityContributors', () => ({ EntityContributors: () => null }));
jest.mock('../../../../components/feature/vocabulary/OtherVillagesSaying', () => ({
  OtherVillagesSaying: () => null,
}));
jest.mock('../../../../components/feature/ReportSheet', () => ({ ReportSheet: () => null }));

const TERM = {
  id: 'm1__miaja',
  municipalityId: 'm1',
  term: 'miaja',
  normalized: 'miaja',
  kind: 'word',
  createdBy: 'u9',
  definitionCount: 1,
  contributorUserIds: [],
  contributorOrgIds: [],
};
const definition = (id: string, text: string) => ({
  id,
  definition: text,
  example: null,
  castellano: null,
  createdBy: 'u9',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  contributorUserIds: [],
  contributorOrgIds: [],
});

beforeEach(() => {
  resetWatchers();
  setWatched('term', TERM);
  setWatched('definitions', [definition('d1', 'Un poco.')]);
});

describe('VocabularyTermScreen', () => {
  it('watches the term and its meanings by the term id', async () => {
    const { getByText } = render(<VocabularyTermScreen />);
    await waitFor(() => getByText('miaja'));
    getByText('Un poco.');
    expect(watchersOf('term')[0]?.args).toEqual(['m1__miaja']);
    expect(watchersOf('definitions')[0]?.args).toEqual(['m1__miaja']);
  });

  it('shows a meaning added elsewhere as soon as the listener delivers it', async () => {
    const { getByText, findByText } = render(<VocabularyTermScreen />);
    await waitFor(() => getByText('Un poco.'));
    emitWatched('definitions', [definition('d1', 'Un poco.'), definition('d2', 'Una migaja.')]);
    expect(await findByText('Una migaja.')).toBeTruthy();
    expect(watchersOf('definitions')).toHaveLength(1);
  });

  it('says the word is not recorded once the term is gone', async () => {
    const { getByText, findByText } = render(<VocabularyTermScreen />);
    await waitFor(() => getByText('miaja'));
    emitWatched('term', null);
    expect(await findByText('village.vocabulary.notFound')).toBeTruthy();
  });
});
