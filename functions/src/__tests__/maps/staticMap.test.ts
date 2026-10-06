import { describe, it, expect, vi, afterEach } from 'vitest';

// Exercise the handler body directly: the onRequest wrapper (CORS, secrets
// binding) is firebase-functions' concern, not ours.
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('../../maps/secret', () => ({ GOOGLE_MAPS_API_KEY: { value: () => 'TEST_KEY' } }));

import { staticMap } from '../../maps/staticMap';

type Handler = (req: { query: Record<string, unknown> }, res: FakeRes) => Promise<void>;

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => FakeRes;
  set: (name: string, value: string) => FakeRes;
  send: (body: unknown) => FakeRes;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    headers: {},
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    set(name, value) {
      res.headers[name] = value;
      return res;
    },
    send(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

async function call(query: Record<string, unknown>): Promise<FakeRes> {
  const res = fakeRes();
  await (staticMap as unknown as Handler)({ query }, res);
  return res;
}

function upstream(opts: { ok: boolean; status?: number; contentType?: string | null; bytes?: number[] }) {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    headers: {
      get: (h: string) => (h.toLowerCase() === 'content-type' ? (opts.contentType ?? null) : null),
    },
    arrayBuffer: () => Promise.resolve(new Uint8Array(opts.bytes ?? [1, 2, 3]).buffer),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('staticMap', () => {
  it('rejects missing or out-of-range coordinates with 400 and never calls Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await call({})).statusCode).toBe(400);
    expect((await call({ lat: '91', lng: '0' })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies the image with the server-side key and a long cache', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(upstream({ ok: true, contentType: 'image/jpeg', bytes: [7, 8, 9] })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await call({ lat: '40.4', lng: '-3.7', zoom: '12' });

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('https://maps.googleapis.com/maps/api/staticmap?');
    expect(url).toContain('key=TEST_KEY');
    expect(url).toContain('center=40.4%2C-3.7');
    expect(url).toContain('zoom=12');
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/jpeg');
    expect(res.headers['Cache-Control']).toBe('public, max-age=86400, s-maxage=604800');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect([...(res.body as Buffer)]).toEqual([7, 8, 9]);
  });

  it('defaults the content type to image/png when Google omits it', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(upstream({ ok: true, contentType: null }))));
    const res = await call({ lat: '40.4', lng: '-3.7' });
    expect(res.headers['Content-Type']).toBe('image/png');
  });

  it('answers 502 when Google responds non-ok, without relaying its body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(upstream({ ok: false, status: 403 }))));
    const res = await call({ lat: '40.4', lng: '-3.7' });
    expect(res.statusCode).toBe(502);
    expect(res.body).toBe('Bad Gateway');
  });

  it('answers 500 when the upstream call throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNRESET'))));
    const res = await call({ lat: '40.4', lng: '-3.7' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe('Internal Server Error');
  });
});
