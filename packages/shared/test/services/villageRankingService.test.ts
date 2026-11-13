// watchRankedVillages reads the one doc `refreshVillageRanking` writes nightly.
// The onSnapshot fake keeps the converter the service attaches and runs it in
// `snap.data()`, where the real SDK does, so the strict schema is exercised.
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

import { Timestamp } from 'firebase/firestore';
import { watchRankedVillages } from '../../src/services/villageRankingService';

function push(raw: Record<string, unknown> | undefined) {
  const converter = state.ref?.converter;
  state.next?.({
    id: 'top',
    exists: () => raw !== undefined,
    data: () =>
      raw === undefined ? undefined : converter ? converter.fromFirestore({ id: 'top', data: () => raw }) : raw,
  });
}

const VILLAGE = {
  id: 'm1',
  name: 'Matabuena',
  slug: 'matabuena',
  province: 'Segovia',
  escudoUrl: null,
  manualEscudo: false,
  score: 12.5,
};

describe('watchRankedVillages', () => {
  beforeEach(() => {
    state.next = null;
    state.fail = null;
  });

  it('listens to villageRankings/top', () => {
    watchRankedVillages(vi.fn(), vi.fn());
    expect(state.path).toEqual(['villageRankings', 'top']);
  });

  it('yields the ranked villages in stored order', () => {
    const onNext = vi.fn();
    watchRankedVillages(onNext, vi.fn());
    push({ computedAt: Timestamp.now(), villages: [VILLAGE, { ...VILLAGE, id: 'm2', score: 3 }] });
    expect(onNext).toHaveBeenLastCalledWith([VILLAGE, { ...VILLAGE, id: 'm2', score: 3 }]);
  });

  it('yields an empty list before the first nightly run', () => {
    const onNext = vi.fn();
    watchRankedVillages(onNext, vi.fn());
    push(undefined);
    expect(onNext).toHaveBeenLastCalledWith([]);
  });

  it('reports a malformed doc instead of rendering it', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchRankedVillages(onNext, onError);
    push({ computedAt: Timestamp.now(), villages: [{ id: 'm1' }] });
    expect(onError).toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});
