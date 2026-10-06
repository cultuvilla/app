import { act, renderHook } from '@testing-library/react-native';
import { useWatch, type Watcher } from '../useWatch';

const mockReport = jest.fn();
jest.mock('../../firestoreErrorLog', () => ({
  reportFirestoreError: (...args: unknown[]) => mockReport(...args),
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
});
