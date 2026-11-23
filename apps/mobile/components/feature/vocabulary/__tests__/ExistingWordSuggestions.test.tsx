import { render, waitFor, act, fireEvent } from '@testing-library/react-native';
import { ExistingWordSuggestions } from '../ExistingWordSuggestions';
import { searchVocabularyWords } from '@cultuvilla/shared/services/vocabularyService';

jest.mock('@cultuvilla/shared/services/vocabularyService', () => ({
  searchVocabularyWords: jest.fn(),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

const mockSearch = searchVocabularyWords as jest.Mock;

const esbardo = {
  id: 'esbardo',
  term: 'Esbardo',
  normalized: 'esbardo',
  kind: 'palabra',
  villageCount: 3,
  firstMunicipalityId: 'm1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSearch.mockResolvedValue([esbardo]);
});
afterEach(() => {
  jest.useRealTimers();
});

/** Advance past the debounce and let the resolved promise flush. */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

describe('<ExistingWordSuggestions>', () => {
  it('offers a word other villages already record', async () => {
    const { getByText } = render(<ExistingWordSuggestions query="esbar" onPick={jest.fn()} />);
    await settle();
    await waitFor(() => expect(getByText('Esbardo')).toBeTruthy());
  });

  it('hands the picked word to the form', async () => {
    const onPick = jest.fn();
    const { findByTestId } = render(<ExistingWordSuggestions query="esbar" onPick={onPick} />);
    await settle();
    fireEvent.press(await findByTestId('vocabulary-suggestion-esbardo'));
    expect(onPick).toHaveBeenCalledWith(esbardo);
  });

  it('says nothing for a one-letter query — every word would match', async () => {
    const { queryByTestId } = render(<ExistingWordSuggestions query="e" onPick={jest.fn()} />);
    await settle();
    expect(mockSearch).not.toHaveBeenCalled();
    expect(queryByTestId('vocabulary-suggestions')).toBeNull();
  });

  // One query per pause, not one per keystroke.
  it('searches once for a word typed letter by letter', async () => {
    const { rerender } = render(<ExistingWordSuggestions query="es" onPick={jest.fn()} />);
    rerender(<ExistingWordSuggestions query="esb" onPick={jest.fn()} />);
    rerender(<ExistingWordSuggestions query="esba" onPick={jest.fn()} />);
    await settle();
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('esba');
  });

  it('renders nothing when no village has the word yet', async () => {
    mockSearch.mockResolvedValue([]);
    const { queryByTestId } = render(<ExistingWordSuggestions query="esbar" onPick={jest.fn()} />);
    await settle();
    expect(queryByTestId('vocabulary-suggestions')).toBeNull();
  });

  // Suggestions are a convenience; the derived id is what prevents duplicates.
  // A failed lookup must never stand between a villager and writing a word down.
  it('stays quiet when the lookup fails rather than blocking the form', async () => {
    mockSearch.mockRejectedValue(new Error('offline'));
    const { queryByTestId } = render(<ExistingWordSuggestions query="esbar" onPick={jest.fn()} />);
    await settle();
    expect(queryByTestId('vocabulary-suggestions')).toBeNull();
  });
});
