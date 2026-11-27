import { describe, it, expect } from 'vitest';
import {
  artifactProblems,
  builtImage,
  functionHealthProblems,
  IMAGE_CHECK_MAX_BUILD_AGE_MS,
  mapLimit,
  parseImage,
  servingRevisions,
  settledFunctions,
  type Api,
} from '../../../../scripts/check-env-parity.mjs';

// The post-deploy check judges each deployed function on what actually serves
// it: state, Eventarc trigger, the revision taking traffic and the image that
// revision runs. Shapes below are copied from the live v2 APIs (dev, 2026-11-27).

const P = 'cultuvilla-beta';
const NOW = Date.parse('2026-11-27T12:00:00Z');
const DIGEST = `sha256:${'a'.repeat(64)}`;
const OLD_DIGEST = `sha256:${'b'.repeat(64)}`;
const PKG = 'cultuvilla--beta__us--central1__add_walk_in_registration';
const IMAGE = `us-central1-docker.pkg.dev/${P}/gcf-artifacts/${PKG}`;
const BUILD = `projects/123/locations/us-central1/builds/168bed67-0fe5`;

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${String(status)}`);
  }
}

interface World {
  fn?: Record<string, unknown>;
  trigger?: Record<string, unknown> | null;
  service?: Record<string, unknown> | null;
  revision?: Record<string, unknown> | null;
  build?: Record<string, unknown> | null;
  tagDigest?: string | null;
  versions?: Record<string, string>; // digest → createTime
}

function fnDoc(name: string, over: Record<string, unknown> = {}, location = 'us-central1') {
  const svc = name.toLowerCase();
  return {
    name: `projects/${P}/locations/${location}/functions/${name}`,
    state: 'ACTIVE',
    environment: 'GEN_2',
    buildConfig: { build: BUILD },
    serviceConfig: {
      service: `projects/${P}/locations/${location}/services/${svc}`,
      revision: `${svc}-00143-rib`,
    },
    ...over,
  };
}

const eventFn = (over: Record<string, unknown> = {}) =>
  fnDoc('syncPublicProfile', {
    eventTrigger: {
      trigger: `projects/${P}/locations/europe-southwest1/triggers/syncpublicprofile-053788`,
      eventType: 'google.cloud.firestore.document.v1.written',
    },
    ...over,
  });

function world(w: World = {}): Api & { calls: string[] } {
  const fn = w.fn ?? eventFn();
  const svcPath = (fn.serviceConfig as { service?: string } | undefined)?.service ?? 'none';
  const revName = (fn.serviceConfig as { revision?: string } | undefined)?.revision ?? 'none';
  const defaults = {
    trigger: { name: 'x', destination: { cloudFunction: fn.name }, conditions: {} },
    service: {
      terminalCondition: { type: 'Ready', state: 'CONDITION_SUCCEEDED' },
      trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', revision: revName, percent: 100 }],
    },
    revision: {
      conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
      containers: [{ image: `${IMAGE}@${DIGEST}` }],
    },
    build: {
      name: BUILD,
      createTime: '2026-11-27T11:36:46Z',
      finishTime: '2026-11-27T11:37:21Z',
      steps: [
        { args: ['--type=ZipArchive'] },
        { args: ['--phase=pre', `--app_image_unique=${IMAGE}:version_1`, `--app_image_stable=${IMAGE}:latest`] },
      ],
    },
  };
  const pick = <K extends keyof typeof defaults>(k: K) => (k in w ? w[k] : defaults[k]);
  const calls: string[] = [];
  const api = (url: string) => {
    calls.push(url);
    const found = (v: unknown) => (v === null || v === undefined ? Promise.reject(new HttpError(404)) : Promise.resolve(v as Record<string, unknown>));
    if (url.includes('eventarc.googleapis.com')) return found(pick('trigger'));
    if (url.includes(`run.googleapis.com/v2/${svcPath}/revisions/`)) return found(pick('revision'));
    if (url.includes(`run.googleapis.com/v2/${svcPath}`)) return found(pick('service'));
    if (url.includes('cloudbuild.googleapis.com')) return found(pick('build'));
    if (url.includes(`/packages/${PKG}/tags/version_1`)) {
      const d = 'tagDigest' in w ? w.tagDigest : DIGEST;
      return found(d && { version: `projects/${P}/locations/us-central1/repositories/gcf-artifacts/packages/${PKG}/versions/${d}` });
    }
    const v = /\/packages\/[^/]+\/versions\/(sha256:[0-9a-f]+)$/.exec(url);
    if (v) return found(w.versions?.[v[1]] && { createTime: w.versions[v[1]] });
    return Promise.reject(new Error(`unrouted ${url}`));
  };
  return Object.assign(api, { calls });
}

const check = (w: World = {}) => functionHealthProblems(world(w), w.fn ?? eventFn(), { now: NOW });

describe('parsing', () => {
  it('parses Artifact Registry image refs, by tag and by digest', () => {
    expect(parseImage(`${IMAGE}@${DIGEST}`)).toEqual({
      location: 'us-central1', project: P, repository: 'gcf-artifacts', package: PKG, tag: null, digest: DIGEST,
    });
    expect(parseImage(`${IMAGE}:version_1`)).toMatchObject({ package: PKG, tag: 'version_1', digest: null });
    expect(parseImage('gcr.io/x/y@sha256:1')).toBeNull();
    expect(parseImage(undefined)).toBeNull();
  });

  it('reads the image a build pushes from its buildpack step', () => {
    expect(builtImage({
      steps: [{ args: ['--phase=pre', `--app_image_unique=${IMAGE}:version_1`] }],
    })).toMatchObject({ package: PKG, tag: 'version_1' });
    expect(builtImage({ steps: [{ args: ['--x'] }] })).toBeNull();
  });

  it('lists only the revisions that take traffic', () => {
    expect(servingRevisions({
      trafficStatuses: [
        { revision: 'b-2', percent: 100 },
        { revision: 'a-1', percent: 0 },
        { type: 'LATEST', percent: 0 },
      ],
    })).toEqual(['b-2']);
    expect(servingRevisions({})).toEqual([]);
  });

  it('maps with a concurrency limit and keeps order', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});

describe('functionHealthProblems', () => {
  it('passes a healthy event trigger on the image its build made', async () => {
    expect(await check()).toEqual([]);
  });

  it('passes a callable (no trigger), and a gateway service in another region', async () => {
    expect(await check({ fn: fnDoc('registerToEvent') })).toEqual([]);
    const gateway = fnDoc('callableGateway', {}, 'europe-southwest1');
    expect(await check({ fn: gateway, revision: { conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }], containers: [{ image: `${IMAGE}@${DIGEST}` }] } })).toEqual([]);
  });

  it('fails a function that is not ACTIVE, without asking further', async () => {
    const api = world();
    expect(await functionHealthProblems(api, eventFn({ state: 'FAILED' }), { now: NOW })).toEqual(['state is FAILED']);
    expect(await functionHealthProblems(api, eventFn({ state: 'DEPLOYING' }), { now: NOW })).toEqual([
      'state is DEPLOYING (still settling after the wait)',
    ]);
    expect(api.calls).toEqual([]);
  });

  it('fails on an ERROR state message', async () => {
    expect(await check({ fn: eventFn({ stateMessages: [{ severity: 'ERROR', type: 'EventarcTrigger', message: 'Eventarc trigger not found\nmore' }] }) })).toEqual([
      'EventarcTrigger: Eventarc trigger not found',
    ]);
  });

  it('fails when the Eventarc trigger has vanished', async () => {
    expect(await check({ trigger: null })).toEqual(['its Eventarc trigger syncpublicprofile-053788 is missing']);
    expect(await check({ fn: eventFn({ eventTrigger: { eventType: 'x' } }) })).toEqual(['has no Eventarc trigger']);
  });

  it('fails a trigger that delivers elsewhere or reports a bad condition', async () => {
    expect(await check({ trigger: { destination: { cloudFunction: 'projects/x/locations/y/functions/other' } } })).toEqual([
      'its Eventarc trigger syncpublicprofile-053788 delivers to something else',
    ]);
    expect(await check({
      trigger: { destination: { cloudRun: { service: 'syncpublicprofile' } }, conditions: { transport: { code: 'NOT_FOUND', message: 'topic gone' } } },
    })).toEqual(['its Eventarc trigger transport: NOT_FOUND topic gone']);
  });

  it('fails when the Cloud Run service is missing or not Ready', async () => {
    expect(await check({ service: null })).toEqual(['its Cloud Run service syncpublicprofile is missing']);
    const notReady = {
      terminalCondition: { type: 'Ready', state: 'CONDITION_FAILED', message: 'Revision failed\nstack' },
      trafficStatuses: [{ revision: 'syncpublicprofile-00143-rib', percent: 100 }],
    };
    expect(await check({ service: notReady })).toEqual(['its Cloud Run service is not Ready (CONDITION_FAILED: Revision failed)']);
  });

  it('fails when traffic is on a revision other than the function\'s', async () => {
    const service = {
      terminalCondition: { state: 'CONDITION_SUCCEEDED' },
      trafficStatuses: [{ revision: 'syncpublicprofile-00142-old', percent: 100 }],
    };
    expect(await check({ service })).toEqual(['traffic goes to syncpublicprofile-00142-old, not its revision syncpublicprofile-00143-rib']);
    expect(await check({ service: { terminalCondition: { state: 'CONDITION_SUCCEEDED' }, trafficStatuses: [] } })).toEqual([
      'no revision receives traffic',
    ]);
  });

  it('fails when the serving revision is not Ready', async () => {
    expect(await check({
      revision: { conditions: [{ type: 'Ready', state: 'CONDITION_FAILED', message: 'Container failed to start' }], containers: [{ image: `${IMAGE}@${DIGEST}` }] },
    })).toEqual(['its serving revision syncpublicprofile-00143-rib is not Ready (CONDITION_FAILED: Container failed to start)']);
  });

  it('fails a revision running an older image than its build pushed (the Órdago 2026-06-04 shape)', async () => {
    const problems = await check({ tagDigest: OLD_DIGEST, versions: { [DIGEST]: '2026-05-28T10:00:00Z' } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^runs cultuvilla--beta__us--central1__add_walk_in_registration@sha256:aaaaaaaaaaaa…, not the image its build 168bed67 made$/);
  });

  it('fails a revision running another package\'s image (a cross-wired bundle)', async () => {
    const other = `us-central1-docker.pkg.dev/${P}/gcf-artifacts/cultuvilla--beta__us--central1__pin_storage_object_token@${DIGEST}`;
    const problems = await check({ revision: { conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }], containers: [{ image: other }] } });
    expect(problems).toEqual([
      expect.stringMatching(/^runs cultuvilla--beta__us--central1__pin_storage_object_token@.*, not the .*add_walk_in_registration image its build 168bed67 made$/),
    ]);
  });

  it('accepts an image a later build has re-tagged, when it was pushed during this function\'s build', async () => {
    expect(await check({ tagDigest: OLD_DIGEST, versions: { [DIGEST]: '2026-11-27T11:37:10Z' } })).toEqual([]);
  });

  it('does not judge the image of a build older than the registry keeps images', async () => {
    const old = new Date(NOW - IMAGE_CHECK_MAX_BUILD_AGE_MS - 60_000).toISOString();
    const api = world({ tagDigest: null, build: { name: BUILD, createTime: old, finishTime: old, steps: [] } });
    expect(await functionHealthProblems(api, eventFn(), { now: NOW })).toEqual([]);
    expect(api.calls.some((u) => u.includes('artifactregistry'))).toBe(false);
  });

  it('skips Cloud Run for a 1st-gen function', async () => {
    const gen1 = { name: `projects/${P}/locations/us-central1/functions/legacy`, state: 'ACTIVE', environment: 'GEN_1' };
    const api = world({ fn: gen1 });
    expect(await functionHealthProblems(api, gen1, { now: NOW })).toEqual([]);
    expect(api.calls).toEqual([]);
  });

  it('propagates a refused read instead of passing it', async () => {
    const api: Api = () => Promise.reject(new HttpError(403));
    await expect(functionHealthProblems(api, eventFn(), { now: NOW })).rejects.toMatchObject({ status: 403 });
  });
});

describe('settledFunctions', () => {
  it('re-lists while a function is DEPLOYING, then returns', async () => {
    let n = 0;
    const api: Api = () => {
      n += 1;
      return Promise.resolve({ functions: [{ name: 'f', state: n < 3 ? 'DEPLOYING' : 'ACTIVE' }] });
    };
    const slept: number[] = [];
    const fns = await settledFunctions(api, P, { delayMs: 5, sleep: (ms) => { slept.push(ms); return Promise.resolve(); } });
    expect(fns).toEqual([{ name: 'f', state: 'ACTIVE' }]);
    expect(slept).toEqual([5, 5]);
  });

  it('gives up after its attempts and returns the still-settling list', async () => {
    const api: Api = () => Promise.resolve({ functions: [{ name: 'f', state: 'DEPLOYING' }] });
    const fns = await settledFunctions(api, P, { attempts: 2, sleep: () => Promise.resolve() });
    expect(fns).toEqual([{ name: 'f', state: 'DEPLOYING' }]);
  });
});

describe('artifactProblems — function health', () => {
  it('reports each unhealthy exported function by name, alongside the presence diff', async () => {
    const files: Record<string, string> = {
      'firestore.rules': 'R',
      'storage.rules': 'S',
      'firestore.indexes.json': JSON.stringify({ indexes: [] }),
      'functions/src/index.ts': "export { syncPublicProfile, registerToEvent } from './x';",
    };
    const healthy = world();
    const api: Api = (url, init) => {
      if (url.includes('/releases/')) return Promise.resolve({ rulesetName: url.includes('cloud.firestore') ? `projects/${P}/rulesets/fs` : `projects/${P}/rulesets/st` });
      if (url.includes('rulesets/fs')) return Promise.resolve({ source: { files: [{ content: 'R' }] } });
      if (url.includes('rulesets/st')) return Promise.resolve({ source: { files: [{ content: 'S' }] } });
      if (url.includes('/indexes')) return Promise.resolve({ indexes: [] });
      if (url.includes('cloudfunctions.googleapis.com')) {
        return Promise.resolve({ functions: [eventFn(), fnDoc('registerToEvent', { state: 'FAILED' })] });
      }
      return healthy(url, init);
    };
    expect(await artifactProblems(api, P, { readFile: (p) => files[p], now: NOW })).toEqual([
      'functions: registerToEvent state is FAILED',
    ]);
  });
});
