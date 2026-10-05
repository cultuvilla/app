import '@testing-library/jest-native/extend-expect';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ type: 'success', data: { idToken: 'test-id-token' } })),
    signOut: jest.fn(async () => undefined),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isSuccessResponse: (r: { type?: string } | null | undefined) => r?.type === 'success',
}));

// The native Firebase module is absent under jest; the analytics adapter's own
// suite overrides these per test.
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(async () => undefined),
  setAnalyticsCollectionEnabled: jest.fn(async () => undefined),
  setUserId: jest.fn(async () => undefined),
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(async () => ({ identityToken: 'test-identity-token' })),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0 },
  AppleAuthenticationButton: 'AppleAuthenticationButton',
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-raw-nonce'),
  digestStringAsync: jest.fn(async () => 'test-hashed-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));
