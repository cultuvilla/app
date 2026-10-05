import { act, render, screen } from '@testing-library/react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { OfflineBanner, isOffline } from '../OfflineBanner';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

type Listener = (state: Partial<NetInfoState>) => void;

describe('isOffline', () => {
  it('is offline only when NetInfo is certain', () => {
    expect(isOffline({ isConnected: false, isInternetReachable: null })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
    expect(isOffline({ isConnected: true, isInternetReachable: null })).toBe(false);
    expect(isOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
  });
});

describe('OfflineBanner', () => {
  it('appears when the connection drops and goes when it returns', () => {
    let listener: Listener = () => undefined;
    jest.spyOn(NetInfo, 'addEventListener').mockImplementation((cb) => {
      listener = cb as Listener;
      return () => undefined;
    });
    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    act(() => listener({ isConnected: false, isInternetReachable: false }));
    expect(screen.getByText('common.offline')).toBeTruthy();

    act(() => listener({ isConnected: true, isInternetReachable: true }));
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });
});
