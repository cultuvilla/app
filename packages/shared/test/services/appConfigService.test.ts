// appConfigService feeds the force-update gate (`resolveVersionGate`, covered
// in test/utils/versionGate.test.ts). It is a listener, not a one-shot read: a
// gate that reads once at launch is down for the session when that one read
// fails, which is how 1.5.0 never showed its wall.
//
// The onSnapshot fake below keeps the converter the service attaches and runs
// it inside `snap.data()`, exactly where the real SDK runs it — so the
// malformed-doc case exercises the real strict Zod converter.
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Converter {
  fromFirestore: (snap: { data: () => unknown; id: string }, options?: unknown) => unknown;
}
interface Ref {
  converter: Converter | null;
  withConverter: (c: Converter) => Ref;
}
type Snap = { id: string; exists: () => boolean; data: () => unknown };

const state: {
  path: string[];
  next: ((snap: Snap) => void) | null;
  fail: ((err: unknown) => void) | null;
  ref: Ref | null;
  unsubscribe: ReturnType<typeof vi.fn>;
} = { path: [], next: null, fail: null, ref: null, unsubscribe: vi.fn() };

vi.mock('../../src/firebase', () => ({
  getDb: () => ({}),
  getFirebaseFunctions: vi.fn(() => ({})),
}));
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    doc: (_db: unknown, ...path: string[]) => {
      state.path = path;
      const ref: Ref = {
        converter: null,
        withConverter(c: Converter) {
          ref.converter = c;
          return ref;
        },
      };
      state.ref = ref;
      return ref;
    },
    onSnapshot: (_ref: unknown, next: (snap: Snap) => void, fail: (err: unknown) => void) => {
      state.next = next;
      state.fail = fail;
      return state.unsubscribe;
    },
  };
});

import { watchAppVersionConfig } from '../../src/services/appConfigService';

const VALID = {
  ios: { minSupported: '1.0.0', latest: '1.2.2' },
  android: { minSupported: '0.0.0', latest: '1.3.0' },
  storeUrl: {
    ios: 'https://apps.apple.com/app/id1',
    android: 'https://play.google.com/store/apps/details?id=com.cultuvilla.app',
  },
};

function push(raw: Record<string, unknown> | undefined) {
  const converter = state.ref?.converter;
  state.next?.({
    id: 'appVersion',
    exists: () => raw !== undefined,
    data: () =>
      raw === undefined
        ? undefined
        : converter
          ? converter.fromFirestore({ id: 'appVersion', data: () => raw })
          : raw,
  });
}

describe('watchAppVersionConfig', () => {
  beforeEach(() => {
    state.path = [];
    state.next = null;
    state.fail = null;
    state.ref = null;
    state.unsubscribe = vi.fn();
  });

  it('listens to config/appVersion and hands back its unsubscribe', () => {
    const unwatch = watchAppVersionConfig(vi.fn(), vi.fn());
    expect(state.path).toEqual(['config', 'appVersion']);
    unwatch();
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('delivers every snapshot, so a wall raised mid-session arrives', () => {
    const onNext = vi.fn();
    watchAppVersionConfig(onNext, vi.fn());
    push(VALID);
    const wall = { ...VALID, ios: { minSupported: '9.0.0', latest: '9.0.0' } };
    push(wall);
    expect(onNext).toHaveBeenNthCalledWith(1, expect.objectContaining(VALID));
    expect(onNext).toHaveBeenNthCalledWith(2, expect.objectContaining(wall));
  });

  it('delivers null when the doc is missing', () => {
    const onNext = vi.fn();
    watchAppVersionConfig(onNext, vi.fn());
    push(undefined);
    expect(onNext).toHaveBeenCalledWith(null);
  });

  it('routes a failed listener to onError', () => {
    const onError = vi.fn();
    watchAppVersionConfig(vi.fn(), onError);
    state.fail?.(new Error('permission-denied'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission-denied' }));
  });

  it('routes a malformed doc to onError instead of throwing', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchAppVersionConfig(onNext, onError);
    // Missing `android` and a non-URL store link: the strict converter throws.
    expect(() => {
      push({ ios: VALID.ios, storeUrl: { ios: 'not a url', android: 'x' } });
    }).not.toThrow();
    expect(onNext).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
