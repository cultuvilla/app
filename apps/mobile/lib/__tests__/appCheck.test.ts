import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type AppCheckModule = typeof import('../appCheck');

const app = { name: '[DEFAULT]' };
const configure = jest.fn();
const initializeAppCheck = jest.fn();
const getApp = jest.fn(() => app);

function load(appEnv: string | undefined): AppCheckModule {
  jest.resetModules();
  jest.doMock('@react-native-firebase/app', () => ({ getApp }));
  jest.doMock('@react-native-firebase/app-check', () => ({
    initializeAppCheck,
    ReactNativeFirebaseAppCheckProvider: jest.fn().mockImplementation(() => ({ configure })),
  }));
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { extra: appEnv === undefined ? {} : { APP_ENV: appEnv } } },
  }));
  return require('../appCheck') as AppCheckModule;
}

beforeEach(() => {
  configure.mockReset();
  initializeAppCheck.mockReset();
  getApp.mockReset();
  getApp.mockImplementation(() => app);
});

describe('appCheckProvidersFor', () => {
  it('uses the debug provider in dev, so dev clients and E2E builds need no console setup', () => {
    const { appCheckProvidersFor } = load('dev');
    expect(appCheckProvidersFor('dev')).toEqual({ android: 'debug', apple: 'debug' });
  });

  it.each(['beta', 'prod'] as const)('attests with Play Integrity and App Attest in %s', (env) => {
    const { appCheckProvidersFor } = load(env);
    expect(appCheckProvidersFor(env)).toEqual({
      android: 'playIntegrity',
      apple: 'appAttestWithDeviceCheckFallback',
    });
  });
});

describe('initMobileAppCheck', () => {
  it.each([
    ['dev', 'debug', 'debug'],
    ['beta', 'playIntegrity', 'appAttestWithDeviceCheckFallback'],
    ['prod', 'playIntegrity', 'appAttestWithDeviceCheckFallback'],
  ])('activates the %s providers on the default app with auto-refresh', (env, android, apple) => {
    load(env).initMobileAppCheck();
    expect(configure).toHaveBeenCalledWith({
      android: { provider: android },
      apple: { provider: apple },
    });
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(initializeAppCheck).toHaveBeenCalledWith(
      app,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
  });

  it('treats a build with no APP_ENV as dev', () => {
    load(undefined).initMobileAppCheck();
    expect(configure).toHaveBeenCalledWith({
      android: { provider: 'debug' },
      apple: { provider: 'debug' },
    });
  });

  it('is idempotent across hot reloads of the bootstrap', () => {
    const { initMobileAppCheck } = load('prod');
    initMobileAppCheck();
    initMobileAppCheck();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  // The hard requirement: App Check failing must never block or crash boot,
  // and so never stop a Firestore/Storage/Functions call from being made.
  describe('never takes the app down', () => {
    it('when the native module rejects the configuration', () => {
      initializeAppCheck.mockImplementation(() => {
        throw new Error('Invalid configuration');
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(() => load('prod').initMobileAppCheck()).not.toThrow();
      expect(warn).toHaveBeenCalledWith('[app-check] not activated', expect.any(Error));
      warn.mockRestore();
    });

    it('when there is no default Firebase app', () => {
      getApp.mockImplementation(() => {
        throw new Error('No Firebase App [DEFAULT] has been created');
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(() => load('beta').initMobileAppCheck()).not.toThrow();
      expect(initializeAppCheck).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('when the bundle carries an unknown APP_ENV', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(() => load('staging').initMobileAppCheck()).not.toThrow();
      warn.mockRestore();
    });

    it('returns without waiting on a token', () => {
      // Never resolves: if boot awaited attestation it would hang here.
      initializeAppCheck.mockImplementation(() => new Promise(() => undefined));
      expect(load('prod').initMobileAppCheck()).toBeUndefined();
    });
  });
});
