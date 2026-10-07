import { describe, expect, it, vi } from 'vitest';
import type { DocumentReference, Query } from '../../src/firebase/sdk/firestore';
import {
  watchCount,
  watchDoc,
  forbiddenAsEmpty,
  watchDocsByIds,
  watchMerged,
  watchQuery,
  type Unwatch,
  type WatchError,
} from '../../src/services/watch';
import { observability } from '../../src/services/observability/observabilityService';

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

// A count is a badge, not a list: one unparseable notification must not blank
// it, so `watchCount` never runs the converter.
describe('watchCount', () => {
  it('counts matching docs without parsing them', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    watchCount({} as Query<{ n: number }>, onNext, onError);
    snapshots.next?.({ docs: [{ id: 'a', data: throwingData }, { id: 'b', data: throwingData }] });
    expect(onNext).toHaveBeenCalledWith(2);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('watchDocsByIds', () => {
  type One = (id: string, onNext: (row: string | null) => void, onError: WatchError) => Unwatch;

  function docs(): { watchOne: One; emit: (id: string, row: string | null) => void; closed: string[] } {
    const nexts = new Map<string, (row: string | null) => void>();
    const closed: string[] = [];
    return {
      watchOne: (id, onNext) => {
        nexts.set(id, onNext);
        return () => {
          closed.push(id);
        };
      },
      emit: (id, row) => nexts.get(id)?.(row),
      closed,
    };
  }

  it('waits for every id, keeps the order asked for and drops missing docs', () => {
    const d = docs();
    const onNext = vi.fn();
    watchDocsByIds(['c', 'a', 'b'], d.watchOne, onNext, vi.fn());

    d.emit('a', 'A');
    d.emit('b', null);
    expect(onNext).not.toHaveBeenCalled();
    d.emit('c', 'C');
    expect(onNext).toHaveBeenLastCalledWith(['C', 'A']);
    d.emit('b', 'B');
    expect(onNext).toHaveBeenLastCalledWith(['C', 'A', 'B']);
  });

  it('closes every listener on unwatch', () => {
    const d = docs();
    watchDocsByIds(['a', 'b'], d.watchOne, vi.fn(), vi.fn())();
    expect(d.closed.sort()).toEqual(['a', 'b']);
  });
});

describe('forbiddenAsEmpty', () => {
  function failingPart(code: string): Part {
    return (_onNext, onError) => {
      onError(Object.assign(new Error(code), { code }));
      return () => undefined;
    };
  }

  it('answers a rules refusal with no rows, so the rest of a merge still emits', () => {
    const allowed = part();
    const onNext = vi.fn();
    const onError = vi.fn();
    watchMerged(
      [forbiddenAsEmpty('test', failingPart('firestore/permission-denied')), forbiddenAsEmpty('test', allowed.part)],
      sortAsc,
      onNext,
      onError,
    );

    allowed.emit([2, 1]);
    expect(onNext).toHaveBeenLastCalledWith([1, 2]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('accepts the JS SDK code too, which has no service prefix', () => {
    const onNext = vi.fn();
    forbiddenAsEmpty('test', failingPart('permission-denied'))(onNext, vi.fn());
    expect(onNext).toHaveBeenCalledWith([]);
  });

  it('logs the refusal with its operation, so a rules regression stays findable', () => {
    const info = vi.spyOn(observability.logger, 'info');
    forbiddenAsEmpty('feed:test', failingPart('firestore/permission-denied'))(vi.fn(), vi.fn());
    expect(info).toHaveBeenCalledWith(expect.any(String), { operation: 'feed:test' });
    info.mockRestore();
  });

  it('still fails on any other error', () => {
    const onNext = vi.fn();
    const onError = vi.fn();
    forbiddenAsEmpty('test', failingPart('firestore/unavailable'))(onNext, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });
});
