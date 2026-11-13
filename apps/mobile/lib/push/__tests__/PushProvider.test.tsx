import { render, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerDevice } from '@cultuvilla/shared/services/notificationService';
import { PushProvider } from '../PushProvider';
import { clearLocalCacheAndRestart } from '../../auth/clearLocalCache';

let tokenListeners: ((token: { type: string; data: string }) => void)[] = [];
let currentToken = 'token-a';

// Both native modules echo every token fetch to the token listeners, the
// behaviour expo's docs warn "may lead to an infinite loop".
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  getDevicePushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.10.0',
  applicationId: 'com.cultuvilla.app',
  getIosPushNotificationServiceEnvironmentAsync: jest.fn().mockResolvedValue('production'),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRootNavigationState: () => ({ key: 'nav' }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/notificationService', () => ({
  registerDevice: jest.fn().mockResolvedValue(undefined),
  markAsRead: jest.fn().mockResolvedValue(undefined),
  unregisterDevice: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../auth/clearLocalCache', () => ({
  clearLocalCacheAndRestart: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('../../../components/feature/PushSoftAskSheet', () => ({ PushSoftAskSheet: () => null }));
let mockAuth: { user: { uid: string } | null; profile: null; profileChecked: boolean; loading: boolean };
jest.mock('../../auth/useAuth', () => ({ useAuth: () => mockAuth }));

const emitToken = (data: string) => {
  for (const listener of tokenListeners) listener({ type: 'android', data });
};
const settle = (ms = 40) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

beforeEach(() => {
  jest.clearAllMocks();
  tokenListeners = [];
  currentToken = 'token-a';
  mockAuth = { user: { uid: 'uid-1' }, profile: null, profileChecked: true, loading: false };
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('1');
  (Notifications.addPushTokenListener as jest.Mock).mockImplementation((listener) => {
    tokenListeners.push(listener);
    return { remove: () => (tokenListeners = tokenListeners.filter((l) => l !== listener)) };
  });
  (Notifications.getDevicePushTokenAsync as jest.Mock).mockImplementation(async () => {
    setTimeout(() => emitToken(currentToken), 0);
    return { type: 'android', data: currentToken };
  });
});

describe('device registration does not feed itself (comments stuck behind a runaway write queue)', () => {
  it('writes the device row once, though fetching the token echoes it to the listener', async () => {
    const view = render(<PushProvider>{null}</PushProvider>);
    await settle();
    expect(registerDevice).toHaveBeenCalledTimes(1);
    expect(Notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('registers a rotated token from the event, without fetching the token again', async () => {
    const view = render(<PushProvider>{null}</PushProvider>);
    await settle();
    (registerDevice as jest.Mock).mockClear();
    (Notifications.getDevicePushTokenAsync as jest.Mock).mockClear();

    currentToken = 'token-b';
    await act(async () => emitToken('token-b'));
    await settle();

    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(registerDevice).toHaveBeenCalledTimes(1);
    expect(registerDevice).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({ token: 'token-b', platform: expect.any(String) }),
    );
    view.unmount();
  });
});

describe('the backlog the loop left on the device is dropped once', () => {
  it('wipes the queue and restarts on the first signed-in launch', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const view = render(<PushProvider>{null}</PushProvider>);
    await settle();
    expect(AsyncStorage.setItem).toHaveBeenCalled();
    expect(clearLocalCacheAndRestart).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('never wipes again', async () => {
    const view = render(<PushProvider>{null}</PushProvider>);
    await settle();
    expect(clearLocalCacheAndRestart).not.toHaveBeenCalled();
    view.unmount();
  });

  it('waits for auth to settle before deciding', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockAuth = { user: null, profile: null, profileChecked: false, loading: true };
    const view = render(<PushProvider>{null}</PushProvider>);
    await settle();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    view.unmount();
  });

  it('spares a signed-out launch, so a fresh install is not wiped mid sign-up', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    mockAuth = { user: null, profile: null, profileChecked: false, loading: false };
    const view = render(<PushProvider>{null}</PushProvider>);
    await settle();
    expect(AsyncStorage.setItem).toHaveBeenCalled();
    expect(clearLocalCacheAndRestart).not.toHaveBeenCalled();
    view.unmount();
  });
});
