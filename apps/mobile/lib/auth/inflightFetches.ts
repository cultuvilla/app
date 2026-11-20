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
 * Third-party code (NetInfo among it) reads `globalThis.fetch` at call time, so
 * wrapping the global is enough to see every request that can do this.
 */

type Fetch = typeof globalThis.fetch;

const SETTLE_TIMEOUT_MS = 2000;

const inflight = new Map<AbortController, Promise<unknown>>();
let closed = false;
let installed = false;

function abortError(): Error {
  const error = new Error('The operation was aborted: the app is restarting.');
  error.name = 'AbortError';
  return error;
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

    const request = original(input, { ...init, signal: controller.signal });
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
 * Refuses new requests, aborts the open ones and waits for them to settle — at
 * most `timeoutMs`, so a request that ignores the abort cannot hold a sign-out.
 */
export async function quiesceFetches(timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
  closed = true;
  const pending = [...inflight];
  for (const [controller] of pending) controller.abort();
  if (pending.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(pending.map(([, settled]) => settled)),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}

/** Lets requests through again, for when the reload did not happen. */
export function resumeFetches(): void {
  closed = false;
}

export function inflightFetchCount(): number {
  return inflight.size;
}
