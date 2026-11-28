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
// The real content policy, with the viewer set per test — so the screen is
// checked against the same answer the rules give (contentPolicyParity.test.ts).
const mockActor: { current: import('@cultuvilla/shared/policy').Actor } = {
  current: { uid: null, isAppAdmin: false, isVillageAdmin: false },
};
jest.mock('../../../../lib/auth/useEntityCapabilities', () => {
  const { can } = jest.requireActual<typeof import('@cultuvilla/shared/policy')>(
    '@cultuvilla/shared/policy',
  );
  return {
    useEntityCapabilities: () => ({
      canManage: false,
      isMember: false,
      can: (
        action: import('@cultuvilla/shared/policy').PolicyAction,
        kind: import('@cultuvilla/shared/policy').PolicyKind,
        doc: import('@cultuvilla/shared/policy').PolicyDoc,
      ) => can(action, kind, mockActor.current, doc),
    }),
  };
});
jest.mock('@cultuvilla/shared/services/vocabularyService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/vocabularyService')>(
      '@cultuvilla/shared/services/vocabularyService',
      () => ({
        watchVocabularyTerm: jest
          .requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers')
          .mockWatcher('term'),
        watchVocabularyDefinitions: jest
          .requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers')
          .mockWatcher('definitions'),
        deleteVocabularyDefinition: jest.fn(),
        deleteVocabularyTerm: jest.fn(),
      }),
    ),
);
jest.mock('@cultuvilla/shared/services/commentsService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/commentsService')>(
      '@cultuvilla/shared/services/commentsService',
      () => ({
        recordEntityView: jest.fn().mockResolvedValue(undefined),
      }),
    ),
);
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
  mockActor.current = { uid: null, isAppAdmin: false, isVillageAdmin: false };
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

  // The vocabularyTerms delete rule lets the author withdraw only an ACTIVE
  // term with no meanings left; the trash button used to ignore the status, so
  // the author of a hidden term got a button whose tap the server refused.
  describe('delete-term button', () => {
    beforeEach(() => {
      mockActor.current = { uid: 'u9', isAppAdmin: false, isVillageAdmin: false };
    });

    it('is offered to the author of an active term with no meanings', async () => {
      setWatched('term', { ...TERM, definitionCount: 0, status: 'active' });
      const { findByTestId } = render(<VocabularyTermScreen />);
      expect(await findByTestId('vocabulary-delete-term')).toBeTruthy();
    });

    it('is not offered to the author once moderation has hidden the term', async () => {
      setWatched('term', { ...TERM, definitionCount: 0, status: 'hidden' });
      const { findByText, queryByTestId } = render(<VocabularyTermScreen />);
      await findByText('miaja');
      expect(queryByTestId('vocabulary-delete-term')).toBeNull();
    });

    it('is offered to a village admin of a hidden term', async () => {
      mockActor.current = { uid: 'boss', isAppAdmin: false, isVillageAdmin: true };
      setWatched('term', { ...TERM, definitionCount: 2, status: 'hidden' });
      const { findByTestId } = render(<VocabularyTermScreen />);
      expect(await findByTestId('vocabulary-delete-term')).toBeTruthy();
    });
  });
});
