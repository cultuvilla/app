/**
 * Keeps a JS reload from crashing iOS on a request still in flight.
 *
 * Expo 56 installs expo/fetch as the global `fetch`. When the JS runtime is torn
 * down for a reload, ExpoFetchModule cancels every open URL task, and a request
 * still waiting for its response then rejects its promise onto the destroyed
 * runtime's scheduler: a SIGSEGV instead of a restart (ios-e2e run 44788829839,
 * where the request was NetInfo's reachability check). Aborting those requests
 * while the runtime is still alive lets each one settle normally first.
 *
 * A body read (`text()`, `json()`, …) holds a native promise of its own, which
 * fires — or is freed, the destructor variant of the same crash — when the body
 * completes. Aborting it would leave that promise pending inside the native
 * response, so body reads are waited for instead.
 *
 * Third-party code (NetInfo among it) reads `globalThis.fetch` at call time, so
 * wrapping the global is enough to see every request that can do this.
 */

import { observability } from '@cultuvilla/shared';

type Fetch = typeof globalThis.fetch;

const SETTLE_TIMEOUT_MS = 2000;

const inflight = new Map<AbortController, Promise<unknown>>();
const reading = new Set<Promise<unknown>>();
const BODY_READS = ['text', 'json', 'arrayBuffer', 'blob', 'formData', 'bytes'] as const;
let closed = false;
let installed = false;

function abortError(): Error {
  const error = new Error('The operation was aborted: the app is restarting.');
  error.name = 'AbortError';
  return error;
}

function trackSettled(promise: Promise<unknown>): void {
  const settled = promise.then(
    () => undefined,
    () => undefined,
  );
  reading.add(settled);
  void settled.then(() => reading.delete(settled));
}

function trackBodyReads(response: Response): void {
  const target = response as unknown as Record<string, unknown>;
  for (const name of BODY_READS) {
    const read = target[name];
    if (typeof read !== 'function') continue;
    target[name] = (...args: unknown[]): unknown => {
      const result: unknown = (read as (...a: unknown[]) => unknown).apply(response, args);
      if (result instanceof Promise) trackSettled(result);
      return result;
    };
  }
}

function callerSignal(input: Parameters<Fetch>[0], init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) return init.signal;
  if (typeof input === 'object' && input !== null && 'signal' in input) {
    return (input as Request).signal ?? undefined;
  }
  return undefined;
}

export function trackInflightFetches(): void {
  if (installed || typeof globalThis.fetch !== 'function') return;
  installed = true;
  const original: Fetch = globalThis.fetch.bind(globalThis);

  const tracked: Fetch = (input, init) => {
    if (closed) return Promise.reject(abortError());
    const controller = new AbortController();
    const outer = callerSignal(input, init);
    if (outer?.aborted) controller.abort();
    const forward = () => controller.abort();
    outer?.addEventListener('abort', forward);

    const request = original(input, { ...init, signal: controller.signal }).then((response) => {
      // From here an abort would orphan a body read's native promise, so the
      // request leaves the abort list the moment its response arrives.
      inflight.delete(controller);
      trackBodyReads(response);
      return response;
    });
    const settled = request.then(
      () => undefined,
      () => undefined,
    );
    inflight.set(controller, settled);
    void settled.then(() => {
      inflight.delete(controller);
      outer?.removeEventListener('abort', forward);
    });
    return request;
  };
  globalThis.fetch = tracked;
}

/**
 * Refuses new requests, aborts the ones still waiting for a response, and waits
 * for those and for any body read to settle — at most `timeoutMs`, so a slow body
 * or a request that ignores the abort cannot hold a sign-out. What is still open
 * then is reported, and the reload goes ahead anyway.
 */
export async function quiesceFetches(timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
  closed = true;
  const pending = [...inflight];
  for (const [controller] of pending) controller.abort();
  // An aborted request settles first, so its body reads are known by then.
  const settled = Promise.all(pending.map(([, done]) => done)).then(() =>
    Promise.all([...reading]),
  );
  if (pending.length === 0 && reading.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = await Promise.race([
    settled.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) {
    observability.logger.warn(
      `reload: ${inflight.size} requests and ${reading.size} body reads still open after ${timeoutMs} ms`,
      { operation: 'reload:quiesceFetches', resultCount: inflight.size + reading.size },
    );
  }
}

/** Lets requests through again, for when the reload did not happen. */
export function resumeFetches(): void {
  closed = false;
}

export function inflightFetchCount(): number {
  return inflight.size + reading.size;
}
