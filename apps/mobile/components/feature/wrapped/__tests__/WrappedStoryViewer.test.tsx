import { Image } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { WrappedStoryViewer } from '../WrappedStoryViewer';
import { STORY_CARD_MS } from '../../../../lib/wrapped/storyProgress';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

const cards = [
  { card: 'cover' as const, url: 'https://x/cover.png' },
  { card: 'stats' as const, url: 'https://x/stats.png' },
];

// A tap reports where it landed; the right of the screen goes forward.
const tapRight = { nativeEvent: { locationX: 10_000 } };
const tapLeft = { nativeEvent: { locationX: 0 } };

function renderViewer(props: Partial<Parameters<typeof WrappedStoryViewer>[0]> = {}) {
  const handlers = { onClose: jest.fn(), onShareLink: jest.fn(), onShareCard: jest.fn(), onOpenVillage: jest.fn() };
  const utils = render(<WrappedStoryViewer cards={cards} title="Fiestas 2026 · Villa" {...handlers} {...props} />);
  return { ...utils, ...handlers };
}

describe('WrappedStoryViewer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  });
  afterEach(() => jest.useRealTimers());

  it('reads where a tap landed before React Native releases the event', () => {
    const { getByTestId, UNSAFE_root } = renderViewer();
    const [pressable] = UNSAFE_root.findAll(
      (n) => n.props.testID === 'wrapped-story-tap' && typeof n.props.onPress === 'function',
    );
    if (!pressable) throw new Error('no tap target');
    // RN nulls a press event's nativeEvent once the handler returns. React
    // runs a queued updater later — two taps in one batch force the queue —
    // so the position must be read inside the handler.
    type Tap = { nativeEvent: { locationX: number } | null };
    const taps: Tap[] = [{ nativeEvent: { locationX: 10_000 } }, { nativeEvent: { locationX: 10_000 } }];
    act(() => {
      for (const tap of taps) {
        (pressable.props as { onPress: (e: unknown) => void }).onPress(tap);
        tap.nativeEvent = null;
      }
    });
    expect(getByTestId('wrapped-story-closing')).toBeTruthy();
  });

  it('pages through the cards by tapping, then lands on the closing screen', () => {
    const { getByTestId, queryByTestId } = renderViewer();
    expect(getByTestId('wrapped-story-card-cover')).toBeTruthy();

    fireEvent.press(getByTestId('wrapped-story-tap'), tapRight);
    expect(getByTestId('wrapped-story-card-stats')).toBeTruthy();

    fireEvent.press(getByTestId('wrapped-story-tap'), tapLeft);
    expect(getByTestId('wrapped-story-card-cover')).toBeTruthy();

    fireEvent.press(getByTestId('wrapped-story-tap'), tapRight);
    fireEvent.press(getByTestId('wrapped-story-tap'), tapRight);
    expect(getByTestId('wrapped-story-closing')).toBeTruthy();
    expect(queryByTestId('wrapped-share-card')).toBeNull();
  });

  it('advances by itself and waits on the closing screen', () => {
    const { getByTestId } = renderViewer();
    act(() => {
      jest.advanceTimersByTime(STORY_CARD_MS + 100);
    });
    expect(getByTestId('wrapped-story-card-stats')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(STORY_CARD_MS * 4);
    });
    expect(getByTestId('wrapped-story-closing')).toBeTruthy();
  });

  it('holds the card while pressed', () => {
    const { getByTestId } = renderViewer();
    fireEvent(getByTestId('wrapped-story-tap'), 'longPress');
    act(() => {
      jest.advanceTimersByTime(STORY_CARD_MS * 2);
    });
    expect(getByTestId('wrapped-story-card-cover')).toBeTruthy();
  });

  it('shares the card on screen and, at the end, the link', () => {
    const { getByTestId, onShareCard, onShareLink, onOpenVillage } = renderViewer({ initialIndex: 1 });
    fireEvent.press(getByTestId('wrapped-share-card'));
    expect(onShareCard).toHaveBeenCalledWith(cards[1]);

    fireEvent.press(getByTestId('wrapped-story-tap'), tapRight);
    fireEvent.press(getByTestId('wrapped-share-link'));
    expect(onShareLink).toHaveBeenCalled();
    fireEvent.press(getByTestId('wrapped-open-village'));
    expect(onOpenVillage).toHaveBeenCalled();
  });

  it('offers no sharing where none was given — a draft in review', () => {
    const { getByTestId, queryByTestId } = renderViewer({ onShareCard: undefined, onShareLink: undefined, initialIndex: 1 });
    expect(queryByTestId('wrapped-share-card')).toBeNull();
    fireEvent.press(getByTestId('wrapped-story-tap'), tapRight);
    expect(queryByTestId('wrapped-share-link')).toBeNull();
  });

  it('starts over from the closing screen, and closes', () => {
    const { getByTestId, onClose } = renderViewer({ initialIndex: 1 });
    fireEvent.press(getByTestId('wrapped-story-tap'), tapRight);
    fireEvent.press(getByTestId('wrapped-replay'));
    expect(getByTestId('wrapped-story-card-cover')).toBeTruthy();
    fireEvent.press(getByTestId('wrapped-story-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
