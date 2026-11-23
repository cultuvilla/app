import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_OTP_MAX_AGE_MS,
  clearPendingOtp,
  readPendingOtp,
  rememberPendingOtp,
  useResumePendingLogin,
} from '../pendingOtp';
import { routes } from '../../navigation/routes';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href) },
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

afterEach(() => jest.restoreAllMocks());

describe('pending OTP sign-in', () => {
  it('reads back the address a code was sent to', async () => {
    await rememberPendingOtp('ana@correo.com');
    expect(await readPendingOtp()).toBe('ana@correo.com');
  });

  it('forgets the address once cleared', async () => {
    await rememberPendingOtp('ana@correo.com');
    await clearPendingOtp();
    expect(await readPendingOtp()).toBeNull();
  });

  it('forgets the address once the code it was sent for has expired', async () => {
    const now = Date.now();
    await rememberPendingOtp('ana@correo.com');
    jest.spyOn(Date, 'now').mockReturnValue(now + PENDING_OTP_MAX_AGE_MS + 1000);
    expect(await readPendingOtp()).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

describe('useResumePendingLogin (the OS closed the app on the code step)', () => {
  it('reopens the login screen for a guest with a code on its way', async () => {
    await rememberPendingOtp('ana@correo.com');
    renderHook(() => useResumePendingLogin(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(routes.login));
  });

  it('stays on the home screen when no code is pending', async () => {
    const read = jest.spyOn(AsyncStorage, 'getItem');
    renderHook(() => useResumePendingLogin(true));
    await waitFor(() => expect(read).toHaveBeenCalled());
    await read.mock.results[0]?.value;
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does nothing for someone who is not a guest', async () => {
    await rememberPendingOtp('ana@correo.com');
    const read = jest.spyOn(AsyncStorage, 'getItem');
    renderHook(() => useResumePendingLogin(false));
    expect(read).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
