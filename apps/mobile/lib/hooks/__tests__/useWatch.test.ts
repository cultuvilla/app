import { act, renderHook } from '@testing-library/react-native';
import { useWatch, type Watcher } from '../useWatch';

const mockReport = jest.fn();
const mockStall = jest.fn();
jest.mock('../../firestoreErrorLog', () => ({
  reportWatchError: (...args: unknown[]) => mockReport(...args),
  reportWatchStall: (...args: unknown[]) => mockStall(...args),
}));

function controllable() {
  const calls: { onNext: (v: string) => void; onError: (e: Error) => void; closed: boolean }[] = [];
  const watcher: Watcher<string> = (onNext, onError) => {
    const call = { onNext, onError, closed: false };
    calls.push(call);
    return () => {
      call.closed = true;
    };
  };
  return { watcher, calls };
}

describe('useWatch', () => {
  it('is loading until the listener answers, then ready with its value', () => {
    const { watcher, calls } = controllable();
    const { result } = renderHook(() => useWatch('t', 'k1', watcher));
    expect(result.current.status).toBe('loading');
    act(() => calls[0]?.onNext('a'));
    expect(result.current).toEqual({ data: 'a', status: 'ready', error: null });
  });

  it('keeps one listener for an unchanged key across renders', () => {
    const { watcher, calls } = controllable();
    const { rerender } = renderHook(() => useWatch('t', 'k1', watcher));
    rerender({});
    rerender({});
    expect(calls).toHaveLength(1);
  });

  it('resubscribes on a new key and never shows the old key’s data', () => {
    const { watcher, calls } = controllable();
    const { result, rerender } = renderHook(({ k }: { k: string }) => useWatch('t', k, watcher), {
      initialProps: { k: 'k1' },
    });
    act(() => calls[0]?.onNext('old'));
    rerender({ k: 'k2' });
    expect(calls[0]?.closed).toBe(true);
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeUndefined();
  });

  it('reports and surfaces a listener error', () => {
    const { watcher, calls } = controllable();
    const { result } = renderHook(() => useWatch('label:x', 'k1', watcher));
    const error = new Error('denied');
    act(() => calls[0]?.onError(error));
    expect(result.current).toEqual({ data: undefined, status: 'error', error });
    expect(mockReport).toHaveBeenCalledWith('label:x', error);
  });

  it('is idle with no key or no watcher', () => {
    const { watcher, calls } = controllable();
    const { result } = renderHook(() => useWatch('t', null, watcher));
    expect(result.current.status).toBe('ready');
    expect(calls).toHaveLength(0);
  });

  // A listener that never answers leaves the screen on its spinner with nothing
  // in any log: the iOS news list in CI, and anything like it on a phone.
  describe('a listener that never answers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockStall.mockClear();
    });
    afterEach(() => jest.useRealTimers());

    it('is reported once, with its label, after 20 s', () => {
      const { watcher } = controllable();
      renderHook(() => useWatch('feed:watchAllVillagesFeed', 'k1', watcher));
      act(() => jest.advanceTimersByTime(19_999));
      expect(mockStall).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(60_000));
      expect(mockStall).toHaveBeenCalledTimes(1);
      expect(mockStall).toHaveBeenCalledWith('feed:watchAllVillagesFeed', 20_000);
    });

    it('is not reported when the listener answers or fails in time, or the screen closes', () => {
      const answered = controllable();
      renderHook(() => useWatch('a', 'k1', answered.watcher));
      act(() => answered.calls[0]?.onNext('x'));

      const failed = controllable();
      renderHook(() => useWatch('b', 'k1', failed.watcher));
      act(() => failed.calls[0]?.onError(new Error('boom')));

      const closed = controllable();
      const { unmount } = renderHook(() => useWatch('c', 'k1', closed.watcher));
      unmount();

      act(() => jest.advanceTimersByTime(60_000));
      expect(mockStall).not.toHaveBeenCalled();
    });
  });
});
