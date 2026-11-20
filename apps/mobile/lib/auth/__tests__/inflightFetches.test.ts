type Mod = typeof import('../inflightFetches');

// A stand-in for expo/fetch: settles only when told to, or rejects on abort.
function fakeFetch() {
  const calls: { signal: AbortSignal; resolve: () => void }[] = [];
  const fn = jest.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        calls.push({ signal, resolve: () => resolve({} as Response) });
        signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          // expo/fetch rejects only once the native cancel has come back.
          setTimeout(() => reject(error), 5);
        });
      }),
  );
  return { fn, calls };
}

let mod: Mod;
let fake: ReturnType<typeof fakeFetch>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  fake = fakeFetch();
  globalThis.fetch = fake.fn as unknown as typeof fetch;
  jest.isolateModules(() => {
    mod = require('../inflightFetches') as Mod;
  });
  mod.trackInflightFetches();
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('inflightFetches', () => {
  it('tracks a request until it settles', async () => {
    const request = fetch('https://example.test');
    expect(mod.inflightFetchCount()).toBe(1);
    fake.calls[0]!.resolve();
    await request;
    await Promise.resolve();
    expect(mod.inflightFetchCount()).toBe(0);
  });

  it('settles every aborted request before quiesce resolves', async () => {
    const events: string[] = [];
    const request = fetch('https://clients3.google.com/generate_204').catch((e: Error) => {
      events.push(`rejected:${e.name}`);
    });
    await mod.quiesceFetches();
    events.push('quiesced');
    await request;
    expect(events).toEqual(['rejected:AbortError', 'quiesced']);
    expect(mod.inflightFetchCount()).toBe(0);
  });

  it('refuses new requests once quiesced, until resumed', async () => {
    await mod.quiesceFetches();
    await expect(fetch('https://example.test')).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.fn).not.toHaveBeenCalled();
    mod.resumeFetches();
    void fetch('https://example.test');
    expect(fake.fn).toHaveBeenCalledTimes(1);
  });

  it("forwards the caller's own abort", async () => {
    const caller = new AbortController();
    const request = fetch('https://example.test', { signal: caller.signal });
    caller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('gives up waiting on a request that ignores the abort', async () => {
    globalThis.fetch = jest.fn(() => new Promise<Response>(() => undefined));
    jest.isolateModules(() => {
      mod = require('../inflightFetches') as Mod;
    });
    mod.trackInflightFetches();
    void fetch('https://example.test');
    jest.useFakeTimers();
    try {
      const done = mod.quiesceFetches(2000);
      jest.advanceTimersByTime(2000);
      await expect(done).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
