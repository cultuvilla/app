import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import { IntroOverlay, INTRO_MAX_MS } from '../IntroOverlay';

// The Lottie stub hands its callbacks to the test, which plays the role of the
// native player deciding when the animation ends.
let mockLottieProps: { onAnimationFinish?: (cancelled: boolean) => void } | null = null;
jest.mock('lottie-react-native', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { onAnimationFinish?: (cancelled: boolean) => void }) => {
      mockLottieProps = props;
      return <View testID="intro-lottie" />;
    },
  };
});

const mockPlayer = { play: jest.fn(), pause: jest.fn(), remove: jest.fn() };
const mockSetAudioMode = jest.fn(async () => undefined);
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...(args as [])),
}));

jest.mock('@cultuvilla/shared', () => ({ observability: { captureError: jest.fn() } }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));

let mockReduceMotion = false;

beforeEach(() => {
  jest.useFakeTimers();
  mockLottieProps = null;
  mockReduceMotion = false;
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(async () => mockReduceMotion);
});

afterEach(() => {
  jest.useRealTimers();
});

async function mount(appReady: boolean) {
  const view = render(<IntroOverlay appReady={appReady} />);
  // Let the reduce-motion check and audio setup resolve.
  await act(async () => {});
  return view;
}

async function finishFade() {
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
}

it('plays the animation and the sound', async () => {
  await mount(false);
  expect(screen.getByTestId('intro-lottie')).toBeTruthy();
  expect(mockSetAudioMode).toHaveBeenCalledWith({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
  });
  expect(mockPlayer.play).toHaveBeenCalled();
});

it('is painted on the app surface, so the fade into the app has no colour jump', async () => {
  await mount(false);
  expect(screen.getByTestId('intro-backdrop')).toHaveStyle({
    backgroundColor: colors.light.bg.surface,
  });
});

it('holds the final frame until the app is ready, then fades out', async () => {
  const view = await mount(false);
  await act(async () => mockLottieProps?.onAnimationFinish?.(false));
  await finishFade();
  expect(screen.getByTestId('intro-overlay')).toBeTruthy();

  view.rerender(<IntroOverlay appReady />);
  await finishFade();
  expect(screen.queryByTestId('intro-overlay')).toBeNull();
  expect(mockPlayer.remove).toHaveBeenCalled();
});

it('does not leave early just because the app is ready', async () => {
  await mount(true);
  await finishFade();
  expect(screen.getByTestId('intro-overlay')).toBeTruthy();
});

it('leaves when tapped', async () => {
  await mount(false);
  fireEvent.press(screen.getByTestId('intro-overlay'));
  await finishFade();
  expect(screen.queryByTestId('intro-overlay')).toBeNull();
  expect(mockPlayer.pause).toHaveBeenCalled();
});

it('gives up after the maximum wait even if the app never becomes ready', async () => {
  await mount(false);
  await act(async () => mockLottieProps?.onAnimationFinish?.(false));
  await act(async () => {
    jest.advanceTimersByTime(INTRO_MAX_MS);
  });
  await finishFade();
  expect(screen.queryByTestId('intro-overlay')).toBeNull();
});

it('is skipped entirely, silently, when Reduce Motion is on', async () => {
  mockReduceMotion = true;
  await mount(false);
  expect(screen.queryByTestId('intro-overlay')).toBeNull();
  expect(mockPlayer.play).not.toHaveBeenCalled();
});
