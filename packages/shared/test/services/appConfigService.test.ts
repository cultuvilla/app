// appConfigService feeds the force-update gate (`resolveVersionGate`, covered
// in test/utils/versionGate.test.ts). Its contract is "never brick the app": any
// failure to produce a valid config must come back as null, which the gate
// reads as 'ok'.
//
// The firebase/firestore fake below keeps the converter the service attaches
// and runs it inside `snap.data()`, exactly where the real SDK runs it — so the
// malformed-doc case exercises the real strict Zod converter.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type RawDoc = Record<string, unknown> | undefined;
interface Converter {
  fromFirestore: (snap: { data: () => unknown; id: string }, options?: unknown) => unknown;
}

const state: { raw: RawDoc; getDocError: Error | null; path: string[] } = {
  raw: undefined,
  getDocError: null,
  path: [],
};

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    doc: (_db: unknown, ...path: string[]) => {
      state.path = path;
      const ref: { converter: Converter | null; withConverter: (c: Converter) => unknown } = {
        converter: null,
        withConverter(c: Converter) {
          ref.converter = c;
          return ref;
        },
      };
      return ref;
    },
    getDoc: (ref: { converter: Converter | null }) => {
      if (state.getDocError) return Promise.reject(state.getDocError);
      const raw = state.raw;
      return Promise.resolve({
        id: 'appVersion',
        exists: () => raw !== undefined,
        data: () =>
          raw === undefined
            ? undefined
            : ref.converter
              ? ref.converter.fromFirestore({ id: 'appVersion', data: () => raw })
              : raw,
      });
    },
  };
});

import { getAppVersionConfig } from '../../src/services/appConfigService';

const VALID = {
  ios: { minSupported: '1.0.0', latest: '1.2.2' },
  android: { minSupported: '0.0.0', latest: '1.3.0' },
  storeUrl: {
    ios: 'https://apps.apple.com/app/id1',
    android: 'https://play.google.com/store/apps/details?id=com.cultuvilla.app',
  },
};

describe('getAppVersionConfig', () => {
  beforeEach(() => {
    state.raw = undefined;
    state.getDocError = null;
    state.path = [];
  });

  it('reads config/appVersion', async () => {
    state.raw = VALID;
    await getAppVersionConfig();
    expect(state.path).toEqual(['config', 'appVersion']);
  });

  it('returns the parsed per-platform config when the doc exists', async () => {
    state.raw = VALID;
    await expect(getAppVersionConfig()).resolves.toEqual(VALID);
  });

  it('returns null when the doc is missing', async () => {
    await expect(getAppVersionConfig()).resolves.toBeNull();
  });

  it('returns null when the read fails (offline, permission denied)', async () => {
    state.getDocError = new Error('unavailable');
    await expect(getAppVersionConfig()).resolves.toBeNull();
  });

  it('returns null instead of throwing on a malformed doc', async () => {
    // Missing `android` and a non-URL store link: the strict converter throws.
    state.raw = { ios: VALID.ios, storeUrl: { ios: 'not a url', android: 'x' } };
    await expect(getAppVersionConfig()).resolves.toBeNull();
  });
});
