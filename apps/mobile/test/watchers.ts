import { act } from '@testing-library/react-native';

/**
 * A controllable stand-in for a service `watch*` function, for screens read
 * through `useWatch`. It records each subscription and answers at once with the
 * value set by `setWatched` (an `Error` answers through `onError`; nothing set
 * leaves the listener silent, i.e. still loading), so a test can later push an
 * update with `emitWatched` the way a Firestore listener would.
 *
 * Use it from a `jest.mock` factory through `jest.requireActual`, so the
 * factory and the test share one registry of listeners:
 *
 *   jest.mock('@cultuvilla/shared/services/x', () => ({
 *     watchX: jest.requireActual<typeof import('../../test/watchers')>('../../test/watchers').mockWatcher('x'),
 *   }));
 */
type Listener = {
  args: unknown[];
  onNext: (value: unknown) => void;
  onError: (error: Error) => void;
  closed: boolean;
};

const listeners: Record<string, Listener[]> = {};
const initial: Record<string, unknown> = {};

export function mockWatcher(name: string) {
  return (...args: unknown[]): (() => void) => {
    const onError = args.pop() as (error: Error) => void;
    const onNext = args.pop() as (value: unknown) => void;
    const listener: Listener = { args, onNext, onError, closed: false };
    (listeners[name] ??= []).push(listener);
    if (name in initial) {
      const value = initial[name];
      if (value instanceof Error) onError(value);
      else onNext(value);
    }
    return () => {
      listener.closed = true;
    };
  };
}

export function setWatched(name: string, value: unknown): void {
  initial[name] = value;
}

export function watchersOf(name: string): Listener[] {
  return listeners[name] ?? [];
}

export function latestWatcher(name: string): Listener {
  const last = watchersOf(name).at(-1);
  if (!last) throw new Error(`${name} was never watched`);
  return last;
}

export function emitWatched(name: string, value: unknown): void {
  act(() => latestWatcher(name).onNext(value));
}

export function resetWatchers(): void {
  for (const key of Object.keys(listeners)) delete listeners[key];
  for (const key of Object.keys(initial)) delete initial[key];
}
