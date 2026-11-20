export const initializeAppCheck = jest.fn(() => ({}));
export const ReactNativeFirebaseAppCheckProvider = jest.fn().mockImplementation(() => ({
  configure: jest.fn(),
}));
