import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NewVocabularyTermScreen from '../nueva';
import { addVocabularyEntry } from '@cultuvilla/shared/services/vocabularyService';
import { useEntityCapabilities } from '../../../../lib/auth/useEntityCapabilities';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa' }),
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
}));
jest.mock('../../../../lib/navigation/VillageRouteGate');
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@cultuvilla/shared/services/vocabularyService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/vocabularyService')>(
      '@cultuvilla/shared/services/vocabularyService',
      () => ({
        addVocabularyEntry: jest.fn().mockResolvedValue('m1__esbardo'),
      }),
    ),
);
jest.mock('../../../../lib/auth/useEntityCapabilities', () => ({
  useEntityCapabilities: jest.fn(),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
// Stands in for the villager/group picker: one button that credits a neighbour
// and a peña, and echoes back which user it was told is the locked author.
jest.mock('../../../../components/feature/OrganizerPicker', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    OrganizerPicker: ({
      selectedUserIds,
      lockedUserId,
      onChangeUsers,
      onChangeOrgs,
    }: {
      selectedUserIds: string[];
      lockedUserId?: string;
      onChangeUsers: (ids: string[]) => void;
      onChangeOrgs: (ids: string[]) => void;
    }) => (
      <Pressable
        testID="mock-credit"
        onPress={() => {
          onChangeUsers([...selectedUserIds, 'bob']);
          onChangeOrgs(['pena-el-botijo']);
        }}
      >
        <Text>{`locked:${lockedUserId}`}</Text>
      </Pressable>
    ),
  };
});

// Stands in for the live suggestion list: one button that offers a word two
// other villages already record.
jest.mock('../../../../components/feature/vocabulary/ExistingWordSuggestions', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    ExistingWordSuggestions: ({
      query,
      onPick,
    }: {
      query: string;
      onPick: (w: { term: string; kind: string; villageCount: number }) => void;
    }) => (
      <Pressable
        testID="mock-suggestion"
        onPress={() => onPick({ term: 'Esbardo', kind: 'dicho', villageCount: 2 })}
      >
        <Text>{`query:${query}`}</Text>
      </Pressable>
    ),
  };
});

const mockCaps = useEntityCapabilities as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCaps.mockReturnValue({ isMember: true, canManage: false, uid: 'alice', loading: false });
});

function fillWord(getByTestId: (id: string) => unknown) {
  fireEvent.changeText(getByTestId('vocabulary-term-input') as never, 'Esbardo');
  fireEvent.changeText(getByTestId('vocabulary-definition-input') as never, 'Cría de oso.');
}

describe('Añadir palabra', () => {
  // Taking an existing word is what stops a near-miss duplicate: the villager
  // gets the established spelling and kind rather than coining their own.
  it('takes the spelling and kind of a word other villages already record', async () => {
    const { getByTestId, getByText } = render(<NewVocabularyTermScreen />);
    fireEvent.changeText(getByTestId('vocabulary-term-input'), 'esbar');
    fireEvent.press(getByTestId('mock-suggestion'));
    expect(getByTestId('vocabulary-joining-notice')).toBeTruthy();

    fireEvent.changeText(getByTestId('vocabulary-definition-input'), 'Cría de oso.');
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('vocabulary-submit'));

    await waitFor(() =>
      expect(addVocabularyEntry).toHaveBeenCalledWith(
        expect.objectContaining({ term: 'Esbardo', kind: 'dicho' }),
      ),
    );
  });

  it('drops back to suggesting once the villager edits the word again', () => {
    const { getByTestId, queryByTestId } = render(<NewVocabularyTermScreen />);
    fireEvent.changeText(getByTestId('vocabulary-term-input'), 'esbar');
    fireEvent.press(getByTestId('mock-suggestion'));
    expect(queryByTestId('vocabulary-joining-notice')).toBeTruthy();

    fireEvent.changeText(getByTestId('vocabulary-term-input'), 'esbardu');
    expect(queryByTestId('vocabulary-joining-notice')).toBeNull();
    expect(queryByTestId('mock-suggestion')).toBeTruthy();
  });

  it('sends no extra credit when nobody else is named — the model adds the author on write', async () => {
    const { getByTestId, getByText } = render(<NewVocabularyTermScreen />);
    fillWord(getByTestId);
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('vocabulary-submit'));

    await waitFor(() =>
      expect(addVocabularyEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          municipalityId: 'm1',
          term: 'Esbardo',
          definition: 'Cría de oso.',
          createdBy: 'alice',
          contributorUserIds: [],
          contributorOrgIds: [],
        }),
      ),
    );
  });

  it('passes the villagers and groups picked on the digitization step', async () => {
    const { getByTestId, getByText } = render(<NewVocabularyTermScreen />);
    fillWord(getByTestId);
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('mock-credit'));
    fireEvent.press(getByTestId('vocabulary-submit'));

    await waitFor(() =>
      expect(addVocabularyEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          contributorUserIds: ['alice', 'bob'],
          contributorOrgIds: ['pena-el-botijo'],
        }),
      ),
    );
  });

  it('locks the author into the picker, so they cannot uncredit themselves', () => {
    const { getByTestId, getByText } = render(<NewVocabularyTermScreen />);
    fillWord(getByTestId);
    fireEvent.press(getByText('common.stepper.next'));
    expect(getByText('locked:alice')).toBeTruthy();
  });

  it('opens the word it just recorded', async () => {
    const { getByTestId, getByText } = render(<NewVocabularyTermScreen />);
    fillWord(getByTestId);
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByTestId('vocabulary-submit'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/villa/palabra/esbardo'));
  });

  it('does not advance past the word step without a word and a meaning', () => {
    const { getByText, queryByTestId } = render(<NewVocabularyTermScreen />);
    fireEvent.press(getByText('common.stepper.next'));
    expect(queryByTestId('mock-credit')).toBeNull();
  });
});
