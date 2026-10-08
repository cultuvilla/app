import { describe, it, expect } from 'vitest';
import {
  artifactProblems,
  backendHeld,
  checkEnv,
  configSnapshot,
  paged,
  type Api,
  type Baseline,
} from '../../../../scripts/check-env-parity.mjs';

// The parity gate's collectors and comparisons, driven by a fake Google API.
// The gate runs first in every deploy: a collector that misreads a response
// would either wave a drifted env through or block every deploy, so each one
// is pinned against the response shapes the real APIs return.

const PROJECT = 'cultuvilla-beta'; // checkEnv('beta') resolves to this project
const NUMBER = '336400380436';

type Route = [RegExp, (url: string) => unknown];

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${String(status)}`);
  }
}

function fakeApi(routes: Route[]): Api & { calls: string[] } {
  const calls: string[] = [];
  const api = (url: string) => {
    calls.push(url);
    const route = routes.find(([re]) => re.test(url));
    if (!route) return Promise.reject(new Error(`unrouted ${url}`));
    try {
      return Promise.resolve(route[1](url) as Record<string, unknown>);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  };
  return Object.assign(api, { calls });
}

// Two pages, as the API splits a long list.
const pages = (key: string, first: unknown[], second: unknown[]) => (url: string) =>
  url.includes('pageToken=p2') ? { [key]: second } : { [key]: first, nextPageToken: 'p2' };

const configRoutes = (over: Partial<Record<string, unknown>> = {}): Route[] => [
  [/cloudresourcemanager.*projects\/cultuvilla-beta$/, () => ({ projectNumber: NUMBER })],
  [/:getIamPolicy$/, () => over.iam ?? {
    bindings: [
      { role: 'roles/editor', members: [`serviceAccount:${NUMBER}-compute@developer.gserviceaccount.com`, 'user:someone@example.com'] },
      { role: 'roles/run.invoker', members: ['serviceAccount:x@cultuvilla-beta.iam.gserviceaccount.com'], condition: { title: 'only-x' } },
    ],
  }],
  [/databases\/\(default\)$/, () => ({
    locationId: 'europe-southwest1', type: 'FIRESTORE_NATIVE', databaseEdition: 'STANDARD',
    concurrencyMode: 'PESSIMISTIC', pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_DISABLED',
    deleteProtectionState: 'DELETE_PROTECTION_DISABLED',
  })],
  [/storage\/v1\/b\//, () => ({ location: 'US-EAST1', locationType: 'region', storageClass: 'REGIONAL', iamConfiguration: { uniformBucketLevelAccess: { enabled: true } } })],
  [/serviceusage.*services\?filter/, pages('services', [{ config: { name: 'b.googleapis.com' } }], [{ config: { name: 'a.googleapis.com' } }])],
  [/secretmanager/, () => ({ secrets: [{ name: `projects/${NUMBER}/secrets/KEY` }] })],
  [/admin\/v2\/projects\/cultuvilla-beta\/config$/, () => ({
    signIn: { email: { enabled: true } }, mfa: { state: 'DISABLED' },
    authorizedDomains: ['cultuvilla-beta.web.app', 'localhost'],
  })],
  [/defaultSupportedIdpConfigs$/, () => ({
    defaultSupportedIdpConfigs: [
      { name: 'projects/cultuvilla-beta/defaultSupportedIdpConfigs/google.com', enabled: true },
      { name: 'projects/cultuvilla-beta/defaultSupportedIdpConfigs/facebook.com', enabled: false },
    ],
  })],
];

const EXPECTED = {
  firestore: {
    locationId: 'europe-southwest1', type: 'FIRESTORE_NATIVE', databaseEdition: 'STANDARD',
    concurrencyMode: 'PESSIMISTIC', pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_DISABLED',
    deleteProtectionState: 'DELETE_PROTECTION_DISABLED',
  },
  bucket: { location: 'US-EAST1', locationType: 'region', storageClass: 'REGIONAL', uniformBucketLevelAccess: true, cors: [] },
  auth: {
    email: true, emailPasswordRequired: false, phone: false, anonymous: false,
    allowDuplicateEmails: false, mfa: 'DISABLED', blockingFunctions: [],
  },
  apis: ['a.googleapis.com', 'b.googleapis.com'],
  iam: [
    'serviceAccount:<number>-compute@developer.gserviceaccount.com roles/editor',
    'serviceAccount:x@<project>.iam.gserviceaccount.com roles/run.invoker [only-x]',
  ],
  secrets: ['KEY'],
  authProviders: ['google.com'],
  authDomains: ['<project>.web.app', 'localhost'],
};

const FILES: Record<string, string> = {
  'firestore.rules': 'FIRESTORE RULES',
  'storage.rules': 'STORAGE RULES',
  'firestore.indexes.json': JSON.stringify({
    indexes: [
      { collectionGroup: 'events', queryScope: 'COLLECTION', fields: [{ fieldPath: 'status', order: 'ASCENDING' }] },
      { collectionGroup: 'news', queryScope: 'COLLECTION', fields: [{ fieldPath: 'tags', arrayConfig: 'CONTAINS' }] },
    ],
  }),
  'functions/src/index.ts': "export { a, b } from './ab';",
};
const readFile = (path: string) => FILES[path];

const deployedIndex = (group: string, fields: object[]) => ({
  name: `projects/${PROJECT}/databases/(default)/collectionGroups/${group}/indexes/x`,
  queryScope: 'COLLECTION',
  fields: [...fields, { fieldPath: '__name__', order: 'ASCENDING' }],
});

const artifactRoutes = (over: { storage?: string; indexes?: object[][]; functions?: string[]; pending?: () => unknown } = {}): Route[] => [
  [/releases\/cloud\.firestore$/, () => ({ rulesetName: `projects/${PROJECT}/rulesets/fs` })],
  [/releases\/firebase\.storage/, () => ({ rulesetName: `projects/${PROJECT}/rulesets/st` })],
  [/rulesets\/fs$/, () => ({ source: { files: [{ content: 'FIRESTORE RULES' }] } })],
  [/rulesets\/st$/, () => ({ source: { files: [{ content: over.storage ?? 'STORAGE RULES' }] } })],
  [/collectionGroups\/-\/indexes/, pages('indexes', ...(over.indexes ?? [
    [deployedIndex('events', [{ fieldPath: 'status', order: 'ASCENDING' }])],
    [deployedIndex('news', [{ fieldPath: 'tags', arrayConfig: 'CONTAINS' }])],
  ]) as [object[], object[]])],
  [/cloudfunctions/, () => ({ functions: (over.functions ?? ['a', 'b']).map((n) => ({ name: `projects/${PROJECT}/locations/europe-west1/functions/${n}` })) })],
  [/_admin\/announce\/pending/, over.pending ?? (() => { throw new HttpError(404); })],
];

describe('configSnapshot', () => {
  it('reads every dimension, follows pagination, keeps only service accounts and enabled providers, and normalises ids', async () => {
    expect(await configSnapshot(fakeApi(configRoutes()), PROJECT, NUMBER)).toEqual(EXPECTED);
  });
});

describe('checkEnv — config', () => {
  const baseline: Baseline = { expected: EXPECTED, exceptions: {} };

  it('passes an env that matches its declared state', async () => {
    expect(await checkEnv('beta', 'config', baseline, fakeApi(configRoutes()))).toEqual([]);
  });

  it('reports an IAM grant the declaration does not have', async () => {
    const api = fakeApi(configRoutes({
      iam: { bindings: [
        { role: 'roles/editor', members: [`serviceAccount:${NUMBER}-compute@developer.gserviceaccount.com`] },
        { role: 'roles/run.invoker', members: ['serviceAccount:x@cultuvilla-beta.iam.gserviceaccount.com'], condition: { title: 'only-x' } },
        { role: 'roles/owner', members: ['serviceAccount:intruder@cultuvilla-beta.iam.gserviceaccount.com'] },
      ] },
    }));
    expect(await checkEnv('beta', 'config', baseline, api)).toEqual([
      'config iam: unexpected serviceAccount:intruder@<project>.iam.gserviceaccount.com roles/owner',
    ]);
  });

  it('applies the env declared exceptions, and only that env', async () => {
    const withException: Baseline = {
      expected: { ...EXPECTED, apis: ['a.googleapis.com', 'b.googleapis.com', 'c.googleapis.com'] },
      exceptions: { beta: [{ dimension: 'apis', remove: ['c.googleapis.com'], reason: 'beta never calls c' }] },
    };
    expect(await checkEnv('beta', 'config', withException, fakeApi(configRoutes()))).toEqual([]);
    expect(await checkEnv('beta', 'config', { ...withException, exceptions: {} }, fakeApi(configRoutes()))).toEqual([
      'config apis: missing c.googleapis.com',
    ]);
  });

  it('fails loudly, with the status, when an API refuses the read', async () => {
    const routes = configRoutes();
    routes.unshift([/:getIamPolicy$/, () => { throw new HttpError(403); }]);
    await expect(checkEnv('beta', 'config', baseline, fakeApi(routes))).rejects.toMatchObject({ status: 403 });
  });
});

describe('artifactProblems', () => {
  it('passes when live rules, indexes (across pages) and functions are the commit', async () => {
    expect(await artifactProblems(fakeApi(artifactRoutes()), PROJECT, { readFile })).toEqual([]);
  });

  it('reports live rules that are not the commit', async () => {
    const problems = await artifactProblems(fakeApi(artifactRoutes({ storage: 'OLD RULES' })), PROJECT, { readFile });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^rules: live storage.rules \(\w+\) is not this commit's \(\w+\)$/);
  });

  it('reports indexes missing and indexes left behind', async () => {
    const api = fakeApi(artifactRoutes({
      indexes: [
        [deployedIndex('events', [{ fieldPath: 'status', order: 'ASCENDING' }])],
        [deployedIndex('newsComments', [{ fieldPath: 'postId', order: 'ASCENDING' }])],
      ],
    }));
    expect(await artifactProblems(api, PROJECT, { readFile })).toEqual([
      'indexes: missing news|COLLECTION|tags:CONTAINS',
      'indexes: not in firestore.indexes.json newsComments|COLLECTION|postId:ASCENDING',
    ]);
  });

  it('reports functions missing and functions left behind', async () => {
    const api = fakeApi(artifactRoutes({ functions: ['a', 'stale'] }));
    expect(await artifactProblems(api, PROJECT, { readFile })).toEqual([
      'functions: b is exported but not deployed',
      'functions: stale is deployed but not exported',
    ]);
  });

  it('while a release holds its backend, compares indexes but not rules or functions', async () => {
    const api = fakeApi(artifactRoutes({ storage: 'OLD RULES', functions: ['a'], indexes: [[], []] }));
    const problems = await artifactProblems(api, PROJECT, { readFile, held: true });
    expect(problems.every((p) => p.startsWith('indexes: missing'))).toBe(true);
    expect(problems).toHaveLength(2);
    expect(api.calls.some((u) => u.includes('firebaserules'))).toBe(false);
  });
});

describe('checkEnv — artifacts and the backend hold', () => {
  const baseline: Baseline = { expected: EXPECTED, exceptions: {} };

  it('reads the hold from the pending release doc', async () => {
    const held = fakeApi(artifactRoutes({ pending: () => ({ fields: { holdBackend: { booleanValue: true } } }) }));
    expect(await backendHeld(held, PROJECT, 'prod')).toBe(true);
    const released = fakeApi(artifactRoutes({ pending: () => ({ fields: { holdBackend: { booleanValue: false } } }) }));
    expect(await backendHeld(released, PROJECT, 'prod')).toBe(false);
    expect(await backendHeld(fakeApi(artifactRoutes()), PROJECT, 'prod')).toBe(false); // 404: nothing pending
  });

  it('does not treat an unreadable pending doc as "not held"', async () => {
    const api = fakeApi(artifactRoutes({ pending: () => { throw new HttpError(403); } }));
    await expect(backendHeld(api, PROJECT, 'prod')).rejects.toMatchObject({ status: 403 });
  });

  it('skips held rules end to end, and reports drift otherwise', async () => {
    const drifted = { storage: 'OLD RULES' };
    const heldApi = fakeApi(artifactRoutes({ ...drifted, pending: () => ({ fields: { holdBackend: { booleanValue: true } } }) }));
    expect(await checkEnv('beta', 'artifacts', baseline, heldApi, { readFile })).toEqual([]);
    const lines = await checkEnv('beta', 'artifacts', baseline, fakeApi(artifactRoutes(drifted)), { readFile });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^artifacts rules: live storage.rules/);
  });
});

describe('paged', () => {
  it('follows nextPageToken until the last page', async () => {
    const api = fakeApi([[/list/, pages('items', [1, 2], [3])]]);
    expect(await paged(api, 'https://x/list?pageSize=2', 'items')).toEqual([1, 2, 3]);
    expect(api.calls).toEqual(['https://x/list?pageSize=2', 'https://x/list?pageSize=2&pageToken=p2']);
  });
});
