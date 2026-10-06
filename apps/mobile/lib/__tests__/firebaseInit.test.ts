import { describe, expect, it, jest } from '@jest/globals';

const initFirebase = jest.fn();
const connectAuthEmulator = jest.fn();
const connectFirestoreEmulator = jest.fn();
const connectFunctionsEmulator = jest.fn();
const connectStorageEmulator = jest.fn();
const handles = { auth: { auth: true }, db: { db: true }, functions: { fn: true }, storage: { st: true } };

function load(extra: Record<string, unknown>): () => void {
  jest.resetModules();
  for (const fn of [initFirebase, connectAuthEmulator, connectFirestoreEmulator, connectFunctionsEmulator, connectStorageEmulator]) {
    fn.mockClear();
  }
  jest.doMock('@cultuvilla/shared/firebase/sdk/auth', () => ({ connectAuthEmulator }));
  jest.doMock('@cultuvilla/shared/firebase/sdk/firestore', () => ({ connectFirestoreEmulator }));
  jest.doMock('@cultuvilla/shared/firebase/sdk/functions', () => ({ connectFunctionsEmulator }));
  jest.doMock('@cultuvilla/shared/firebase/sdk/storage', () => ({ connectStorageEmulator }));
  jest.doMock('../appCheck', () => ({ initMobileAppCheck: jest.fn() }));
  jest.doMock('@cultuvilla/shared/firebase', () => ({
    initFirebase,
    getAuth: () => handles.auth,
    getDb: () => handles.db,
    getFirebaseFunctions: () => handles.functions,
    getFirebaseStorage: () => handles.storage,
  }));
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { extra: { firebaseConfig: { projectId: 'test-project' }, ...extra } } },
  }));
  return (require('../firebaseInit') as { bootstrapFirebase: () => void }).bootstrapFirebase;
}

describe('bootstrapFirebase', () => {
  it('initialises the native SDKs with the env config and talks to real Firebase', () => {
    load({})();
    expect(initFirebase).toHaveBeenCalledWith({ projectId: 'test-project' });
    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
  });

  it('points every SDK at the local emulators only in an E2E build', () => {
    load({ useEmulator: true })();
    expect(connectAuthEmulator).toHaveBeenCalledWith(handles.auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    expect(connectFirestoreEmulator).toHaveBeenCalledWith(handles.db, '127.0.0.1', 8080);
    expect(connectFunctionsEmulator).toHaveBeenCalledWith(handles.functions, '127.0.0.1', 5001);
    expect(connectStorageEmulator).toHaveBeenCalledWith(handles.storage, '127.0.0.1', 9199);
  });
});
