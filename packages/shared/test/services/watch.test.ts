import { describe, expect, it, vi } from 'vitest';
import type { DocumentReference, Query } from '../../src/firebase/sdk/firestore';
import { watchDoc, watchMerged, watchQuery, type Unwatch, type WatchError } from '../../src/services/watch';

type SnapshotCallback = (snap: unknown) => void;
const snapshots = vi.hoisted(() => ({ next: undefined as ((snap: unknown) => void) | undefined }));

vi.mock('../../src/firebase/sdk/firestore', () => ({
  onSnapshot: (_target: unknown, onNext: SnapshotCallback) => {
    snapshots.next = onNext;
    return () => undefined;
  },
}));

const throwingData = () => {
  throw new Error('Invalid input: expected date, received null');
};

type Part = (onNext: (rows: number[]) => void, onError: WatchError) => Unwatch;

function part(): { part: Part; emit: (rows: number[]) => void; unwatch: ReturnType<typeof vi.fn> } {
  let next: ((rows: number[]) => void) | undefined;
  const unwatch = vi.fn();
  return {
    part: (onNext) => {
      next = onNext;
      return unwatch;
    },
    emit: (rows) => next?.(rows),
    unwatch,
  };
}

const sortAsc = (rows: number[]) => [...rows].sort((a, b) => a - b);

describe('watchMerged', () => {
  it('waits for every part before the first emission, then re-merges on each update', () => {
    const a = part();
    const b = part();
    const onNext = vi.fn();
    watchMerged([a.part, b.part], sortAsc, onNext, vi.fn());

    a.emit([3, 1]);
    expect(onNext).not.toHaveBeenCalled();
    b.emit([2]);
    expect(onNext).toHaveBeenLastCalledWith([1, 2, 3]);
    a.emit([5]);
    expect(onNext).toHaveBeenLastCalledWith([2, 5]);
  });

  it('emits the empty merge at once when there are no parts', () => {
    const onNext = vi.fn();
    watchMerged<number>([], sortAsc, onNext, vi.fn());
    expect(onNext).toHaveBeenCalledWith([]);
  });

  it('closes every part on unwatch', () => {
    const a = part();
    const b = part();
    watchMerged([a.part, b.part], sortAsc, vi.fn(), vi.fn())();
    expect(a.unwatch).toHaveBeenCalledTimes(1);
    expect(b.unwatch).toHaveBeenCalledTimes(1);
  });
});

// A converter that throws inside the SDK's snapshot callback reaches no caller,
// so the screen silently stopped rendering. It must surface as the watcher's error.
describe('converter failures', () => {
  it('reports a query whose rows fail to parse instead of throwing', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchQuery({} as Query<{ n: number }>, onNext, onError);
    snapshots.next?.({ docs: [{ id: 'a', data: throwingData }] });
    expect(onNext).not.toHaveBeenCalled();
    const [error] = onError.mock.calls[0] as [Error];
    expect(error.message).toMatch(/expected date/);
  });

  it('reports a doc that fails to parse instead of throwing', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchDoc({} as DocumentReference<{ n: number }>, onNext, onError);
    snapshots.next?.({ id: 'a', data: throwingData });
    expect(onNext).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('still delivers a doc that parses', () => {
    const onNext = vi.fn();
    watchDoc({} as DocumentReference<{ n: number }>, onNext, vi.fn());
    snapshots.next?.({ id: 'a', data: () => ({ n: 1 }) });
    expect(onNext).toHaveBeenCalledWith({ id: 'a', n: 1 });
  });
});
