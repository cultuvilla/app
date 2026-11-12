import { act, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COPIED_TOAST_MS, CopiedToast } from '../CopiedToast';
import { copyText } from '../../../lib/clipboard';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

const setString = Clipboard.setStringAsync as jest.Mock;

function setPlatform(os: 'ios' | 'android', version: number | string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
}

describe('copyText + CopiedToast', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  beforeEach(() => {
    jest.useFakeTimers();
    setString.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
    setPlatform(originalOS as 'ios' | 'android', originalVersion);
  });

  it('copies the value and shows "Copiado" for a moment', async () => {
    setPlatform('ios', '18.0');
    render(<CopiedToast />);
    expect(screen.queryByTestId('copied-toast')).toBeNull();

    await act(() => copyText('ES12 3456'));
    expect(setString).toHaveBeenCalledWith('ES12 3456');
    expect(screen.getByTestId('copied-toast')).toHaveTextContent(/clipboard\.copied/);

    act(() => jest.advanceTimersByTime(COPIED_TOAST_MS));
    expect(screen.queryByTestId('copied-toast')).toBeNull();
  });

  it('leaves the confirmation to Android 13+, which shows its own', async () => {
    setPlatform('android', 34);
    render(<CopiedToast />);
    await act(() => copyText('600111222'));
    expect(setString).toHaveBeenCalledWith('600111222');
    expect(screen.queryByTestId('copied-toast')).toBeNull();
  });

  it('shows nothing when the copy fails', async () => {
    setPlatform('ios', '18.0');
    setString.mockRejectedValueOnce(new Error('unavailable'));
    render(<CopiedToast />);
    await act(() => copyText('x'));
    expect(screen.queryByTestId('copied-toast')).toBeNull();
  });
});
