import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The native E2E runner warms the Functions emulator's worker for every
// callable a run's flows wait on, before the first flow: a cold worker queued
// 53 s on a loaded macOS runner and outlasted flow 12's 60 s wait (ios-e2e
// 44826311824). These pin the warm step and the flow → callable map it reads.

const repoRoot = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');
const suiteDir = resolve(repoRoot, 'apps/mobile/e2e/native');

interface WarmResult {
  warmed: string[];
  failed: string[];
}
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  status: number;
}>;
const { WARM_REGION, callablesToWarm, readFlowCallables, warmCallables } = (await import(
  pathToFileURL(resolve(repoRoot, 'scripts/lib/warm-callables.mjs')).href
)) as {
  WARM_REGION: string;
  callablesToWarm: (flows: string[], map: Record<string, string[]>) => string[];
  readFlowCallables: (dir: string) => Record<string, string[]>;
  warmCallables: (opts: {
    label: string;
    names: string[];
    host: string | undefined;
    project: string;
    fetchImpl?: FetchLike;
    loadBudgetMs?: number;
    retryDelayMs?: number;
    log?: { log: (m: string) => void; warn: (m: string) => void };
  }) => Promise<WarmResult>;
};

const silent = { log: () => {}, warn: () => {} };

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.parentPath.includes('__tests__'))
    .map((e) => resolve(e.parentPath, e.name));
}

const callableSources = new Map<string, string>();
for (const file of filesUnder(resolve(repoRoot, 'functions/src'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/export const (\w+) = defineCallable\b/g)) callableSources.set(m[1], src);
}

describe('the flow → callable map', () => {
  const map = readFlowCallables(suiteDir);
  const flows = readdirSync(resolve(suiteDir, 'flows')).filter((f) => f.endsWith('.yaml'));

  it('names only flows that exist, in filename order', () => {
    for (const flow of Object.keys(map)) expect(flows).toContain(flow);
    expect(Object.keys(map)).toEqual([...Object.keys(map)].sort());
  });

  it('names only callables, each defined in the region the runner warms', () => {
    expect(callableSources.size).toBeGreaterThan(10);
    expect(read('functions/src/shared/define/region.ts')).toContain(`DEFAULT_FUNCTIONS_REGION = '${WARM_REGION}'`);
    for (const [flow, names] of Object.entries(map)) {
      expect(names.length, flow).toBeGreaterThan(0);
      for (const name of names) {
        const src = callableSources.get(name);
        expect(src, `${flow}: ${name} is not a defineCallable export`).toBeDefined();
        expect(src, `${name} overrides its region`).not.toMatch(/\bregion:/);
      }
    }
  });

  // The flows whose first callable call failed a first attempt on 2026-11-20.
  it('covers the callables flows 11 and 12 timed out on', () => {
    expect(map['11-otp-login.yaml']).toEqual(expect.arrayContaining(['sendAuthOtpCode', 'verifyAuthOtpCode']));
    expect(map['12-group-avisos-chat.yaml']).toContain('sendGroupMessage');
  });
});

describe('callablesToWarm', () => {
  it("warms only this run's flows, each callable once", () => {
    const map = { 'a.yaml': ['x', 'y'], 'b.yaml': ['y', 'z'], 'c.yaml': ['w'] };
    expect(callablesToWarm(['a.yaml', 'b.yaml', 'd.yaml'], map)).toEqual(['x', 'y', 'z']);
    expect(callablesToWarm([], map)).toEqual([]);
  });
});

describe('warmCallables', () => {
  it('sends a body the callable protocol rejects before any handler runs', async () => {
    const calls: { url: string; body: string; method: string; type: string }[] = [];
    const fetchImpl: FetchLike = (url, init) => {
      calls.push({ url, body: init.body, method: init.method, type: init.headers['Content-Type'] });
      return Promise.resolve({ status: 400 });
    };
    const result = await warmCallables({
      label: 't',
      names: ['sendGroupMessage'],
      host: '127.0.0.1:5001',
      project: 'cultuvilla-test',
      fetchImpl,
      log: silent,
    });
    expect(calls).toEqual([
      {
        url: `http://127.0.0.1:5001/cultuvilla-test/${WARM_REGION}/sendGroupMessage`,
        body: '{}',
        method: 'POST',
        type: 'application/json',
      },
    ]);
    // No `data` key: firebase-functions' isValidRequest refuses it, so the
    // handler — and whatever it writes — never runs.
    expect(JSON.parse(calls[0].body)).not.toHaveProperty('data');
    expect(result).toEqual({ warmed: ['sendGroupMessage'], failed: [] });
  });

  it('boots one worker at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl: FetchLike = async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { status: 400 };
    };
    await warmCallables({ label: 't', names: ['a', 'b', 'c'], host: 'h:1', project: 'p', fetchImpl, log: silent });
    expect(peak).toBe(1);
  });

  it('reports what it could not warm and never throws', async () => {
    const fetchImpl: FetchLike = (url) =>
      url.endsWith('/gone') ? Promise.resolve({ status: 404 }) : Promise.reject(new Error('ECONNREFUSED'));
    const result = await warmCallables({
      label: 't',
      names: ['gone', 'down'],
      host: 'h:1',
      project: 'p',
      fetchImpl,
      loadBudgetMs: 0,
      log: silent,
    });
    expect(result).toEqual({ warmed: [], failed: ['gone (HTTP 404)', 'down (ECONNREFUSED)'] });
  });

  // Seen locally: the emulator opens its ports before it has loaded the
  // functions, and answers 404 meanwhile.
  it('waits out the 404s of an emulator still loading its functions', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = () => Promise.resolve({ status: ++calls < 3 ? 404 : 400 });
    const result = await warmCallables({
      label: 't',
      names: ['a'],
      host: 'h:1',
      project: 'p',
      fetchImpl,
      retryDelayMs: 1,
      log: silent,
    });
    expect(calls).toBe(3);
    expect(result).toEqual({ warmed: ['a'], failed: [] });
  });

  it('warms nothing without a Functions emulator', async () => {
    const result = await warmCallables({ label: 't', names: ['a'], host: undefined, project: 'p', log: silent });
    expect(result).toEqual({ warmed: [], failed: ['a'] });
  });
});

describe('the suite loop', () => {
  it("warms the planned flows' callables once, before the first flow", () => {
    const lib = read('scripts/lib/maestro-suite.mjs');
    const body = lib.slice(lib.indexOf('export async function runMaestroSuite'));
    const warm = body.indexOf('await warmCallables(');
    const loop = body.indexOf('for (const name of flows)');
    expect(warm).toBeGreaterThan(-1);
    expect(warm).toBeLessThan(loop);
    const call = body.slice(warm, loop);
    expect(call).toContain('names: callablesToWarm(flows, readFlowCallables(SUITE_DIR))');
    expect(call).toContain('host: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST');
  });
});
