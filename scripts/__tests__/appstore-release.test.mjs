import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ascUrl,
  classifyReleasability,
  classifyVersionState,
  isBuildReady,
  pickEditableVersion,
  pickTestflightGroups,
  signAscJwt,
} from '../lib/appstore.mjs';
import {
  distributeToTestflight,
  findOrCreateVersion,
  getAvailability,
  getBuildBetaState,
  latestBuildForVersion,
  submitForBetaReview,
  releaseVersion,
  submitIosForReview,
  waitForBuild,
} from '../lib/appstore-flows.mjs';
import { extractReleaseNotes, MAX_WHATS_NEW } from '../lib/changelog-notes.mjs';
import { generateKeyPairSync } from 'node:crypto';

// ── JWT ───────────────────────────────────────────────────────────────────

test('signAscJwt produces an ES256 JWT with a 64-byte JOSE signature', () => {
  // Apple rejects a DER signature with an opaque 401, so the encoding is the
  // whole point of this test: ES256 over P-256 is exactly r||s = 64 bytes.
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = signAscJwt({ keyId: 'K', issuerId: 'I', privateKey: pem }, 1_700_000_000);

  const [header, payload, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), {
    alg: 'ES256',
    kid: 'K',
    typ: 'JWT',
  });
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(claims.exp - claims.iat, 1200, 'ASC caps token lifetime at 20 minutes');
  assert.equal(Buffer.from(sig, 'base64url').length, 64);
  assert.ok(!jwt.includes('='), 'base64url is unpadded');
});

// ── pure decisions ────────────────────────────────────────────────────────

test('isBuildReady only says ready on processingState VALID', () => {
  const builds = [
    { id: 'b1', attributes: { version: '9', processingState: 'PROCESSING' } },
    { id: 'b2', attributes: { version: '10', processingState: 'VALID' } },
  ];
  assert.deepEqual(isBuildReady(builds, '9'), { found: true, ready: false, state: 'PROCESSING', id: 'b1' });
  assert.deepEqual(isBuildReady(builds, '10'), { found: true, ready: true, state: 'VALID', id: 'b2' });
  assert.deepEqual(isBuildReady(builds, '11'), { found: false, ready: false, state: null, id: null });
  // Build numbers arrive as both strings and numbers depending on the caller.
  assert.equal(isBuildReady(builds, 10).ready, true);
});

test('pickEditableVersion ignores versions that are already in flight', () => {
  const versions = [
    { id: 'v1', attributes: { versionString: '1.0.0', appStoreState: 'READY_FOR_SALE' } },
    { id: 'v2', attributes: { versionString: '1.1.0', appStoreState: 'PREPARE_FOR_SUBMISSION' } },
  ];
  assert.equal(pickEditableVersion(versions, '1.1.0').id, 'v2');
  assert.equal(pickEditableVersion(versions, '1.0.0'), null);
});

test('classifyVersionState separates submit, noop, and unexpected', () => {
  assert.equal(classifyVersionState('PREPARE_FOR_SUBMISSION'), 'submit');
  assert.equal(classifyVersionState('REJECTED'), 'submit');
  assert.equal(classifyVersionState('WAITING_FOR_REVIEW'), 'noop');
  assert.equal(classifyVersionState('READY_FOR_SALE'), 'noop');
  assert.equal(classifyVersionState('SOMETHING_NEW_FROM_APPLE'), 'error');
});

test('classifyReleasability only greenlights PENDING_DEVELOPER_RELEASE', () => {
  assert.deepEqual(classifyReleasability('PENDING_DEVELOPER_RELEASE'), { releasable: true, reason: null });
  assert.equal(classifyReleasability('READY_FOR_SALE').releasable, false);
  assert.equal(classifyReleasability('READY_FOR_SALE').reason, 'already released');
  assert.equal(classifyReleasability('IN_REVIEW').releasable, false);
});

// ── release notes ─────────────────────────────────────────────────────────

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Something not shipped yet.

## v1.0.0 — 2026-08-28

### Added

- **Primera versión** con \`eventos\` y [pueblos](docs/x.md).
- Segunda cosa.

## v0.30.0 — 2026-08-27

- Older stuff.
`;

test('extractReleaseNotes takes one version block and flattens it to plain text', () => {
  const notes = extractReleaseNotes(CHANGELOG, '1.0.0');
  assert.equal(notes, 'Added\n\n• Primera versión con eventos y pueblos.\n• Segunda cosa.');
  assert.ok(!notes.includes('Unreleased'), 'must not bleed into the Unreleased section');
  assert.ok(!notes.includes('0.30.0'), 'must stop at the next version heading');
  assert.ok(!notes.includes('**'), 'the App Store renders plain text, not markdown');
});

test('extractReleaseNotes refuses a version that was never stamped', () => {
  // Shipping with an empty "What's New" is worse than failing the release job.
  assert.throws(() => extractReleaseNotes(CHANGELOG, '1.1.0'), /no "## v1\.1\.0" section/);
});

test('extractReleaseNotes prefers a store-notes block over the whole section', () => {
  // The CHANGELOG is written for the team; a release with many entries flattens
  // into a 4000-char wall that Apple truncates mid-sentence.
  const withNotes = [
    '## v3.0.0 — 2026-01-01',
    '',
    '<!-- store-notes -->',
    '- **Avisos** en el móvil.',
    '<!-- /store-notes -->',
    '',
    '### Added',
    '',
    '- A long internal entry with `code` and a **Migration:** note.',
    '',
    '## v2.0.0 — 2025-12-01',
  ].join('\n');
  assert.equal(extractReleaseNotes(withNotes, '3.0.0'), '• Avisos en el móvil.');
});

test('extractReleaseNotes truncates to the App Store limit', () => {
  const long = `## v2.0.0 — 2026-01-01\n\n${'- padding padding padding\n'.repeat(400)}`;
  const notes = extractReleaseNotes(long, '2.0.0');
  assert.equal(notes.length, MAX_WHATS_NEW);
  assert.ok(notes.endsWith('…'));
});

// ── flows, against a fake ASC ─────────────────────────────────────────────

/** Records every call and answers from a canned route table. */
function fakeAsc(routes) {
  const calls = [];
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    for (const [pattern, handler] of routes) {
      if (pattern.test(`${method} ${path}`)) {
        return typeof handler === 'function' ? handler(calls) : handler;
      }
    }
    throw new Error(`fakeAsc: unhandled ${method} ${path}`);
  };
  return { request, calls };
}

test('waitForBuild polls until the build turns VALID', async () => {
  let n = 0;
  const { request } = fakeAsc([
    [
      /^GET \/builds/,
      () => {
        n += 1;
        return {
          data: [{ id: 'b1', attributes: { version: '9', processingState: n < 3 ? 'PROCESSING' : 'VALID' } }],
        };
      },
    ],
  ]);
  const id = await waitForBuild(request, {
    ascAppId: 'app1',
    buildNumber: '9',
    delayMs: 0,
    sleep: async () => {},
  });
  assert.equal(id, 'b1');
  assert.equal(n, 3);
});

test('waitForBuild gives up rather than hanging forever', async () => {
  const { request } = fakeAsc([
    [/^GET \/builds/, { data: [{ id: 'b1', attributes: { version: '9', processingState: 'PROCESSING' } }] }],
  ]);
  await assert.rejects(
    waitForBuild(request, { ascAppId: 'a', buildNumber: '9', attempts: 2, sleep: async () => {} }),
    /never reached processingState=VALID/,
  );
});

test('findOrCreateVersion creates with the requested releaseType', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/apps\/app1\/appStoreVersions/, { data: [] }],
    [/^POST \/appStoreVersions$/, { data: { id: 'v-new' } }],
  ]);
  const result = await findOrCreateVersion(request, {
    ascAppId: 'app1',
    versionString: '1.1.0',
    releaseType: 'AFTER_APPROVAL',
  });
  assert.deepEqual(result, { id: 'v-new', created: true });
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.body.data.attributes.releaseType, 'AFTER_APPROVAL');
  assert.equal(post.body.data.attributes.platform, 'IOS');
});

test('findOrCreateVersion renames a never-submitted draft of another version instead of creating', async () => {
  const { request, calls } = fakeAsc([
    [
      /^GET \/apps\/app1\/appStoreVersions/,
      {
        data: [
          { id: 'v180', attributes: { versionString: '1.8.0', appStoreState: 'PREPARE_FOR_SUBMISSION' } },
          { id: 'v171', attributes: { versionString: '1.7.1', appStoreState: 'READY_FOR_SALE' } },
        ],
      },
    ],
    [/^PATCH \/appStoreVersions\/v180$/, { data: { id: 'v180' } }],
  ]);
  const result = await findOrCreateVersion(request, {
    ascAppId: 'app1',
    versionString: '1.8.1',
    releaseType: 'AFTER_APPROVAL',
  });
  assert.deepEqual(result, { id: 'v180', created: false, renamedFrom: '1.8.0' });
  assert.equal(calls.some((c) => c.method === 'POST'), false);
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.body.data.attributes.versionString, '1.8.1');
});

test('findOrCreateVersion no-ops on a version already in review', async () => {
  const { request } = fakeAsc([
    [
      /^GET \/apps\/app1\/appStoreVersions/,
      { data: [{ id: 'v1', attributes: { versionString: '1.0.0', appStoreState: 'IN_REVIEW' } }] },
    ],
  ]);
  const result = await findOrCreateVersion(request, {
    ascAppId: 'app1',
    versionString: '1.0.0',
    releaseType: 'AFTER_APPROVAL',
  });
  assert.equal(result.alreadyInFlight, true);
  assert.equal(result.created, false);
});

test('findOrCreateVersion refuses to guess at an unknown state', async () => {
  const { request } = fakeAsc([
    [
      /^GET \/apps\/app1\/appStoreVersions/,
      { data: [{ id: 'v1', attributes: { versionString: '1.0.0', appStoreState: 'WEIRD' } }] },
    ],
  ]);
  await assert.rejects(
    findOrCreateVersion(request, { ascAppId: 'app1', versionString: '1.0.0', releaseType: 'AFTER_APPROVAL' }),
    /unexpected state 'WEIRD'/,
  );
});

test('submitIosForReview runs the whole flow in order and enables phased release', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/builds/, { data: [{ id: 'b9', attributes: { version: '9', processingState: 'VALID' } }] }],
    [/^GET \/apps\/app1\/appStoreVersions/, { data: [] }],
    [/^POST \/appStoreVersions$/, { data: { id: 'v1' } }],
    [/^GET \/appStoreVersions\/v1\/appStoreVersionLocalizations/, { data: [] }],
    [/^POST \/appStoreVersionLocalizations$/, { data: { id: 'loc1' } }],
    [/^PATCH \/appStoreVersions\/v1\/relationships\/build$/, null],
    [/^GET \/appStoreVersions\/v1\/appStoreVersionPhasedRelease$/, { data: null }],
    [/^POST \/appStoreVersionPhasedReleases$/, { data: { id: 'ph1' } }],
    [/^GET \/apps\/app1\/reviewSubmissions/, { data: [] }],
    [/^POST \/reviewSubmissions$/, { data: { id: 's1' } }],
    [/^GET \/reviewSubmissions\/s1\/items/, { data: [] }],
    [/^POST \/reviewSubmissionItems$/, { data: { id: 'i1' } }],
    [/^PATCH \/reviewSubmissions\/s1$/, { data: { id: 's1' } }],
  ]);

  const result = await submitIosForReview({
    request,
    ascAppId: 'app1',
    versionString: '1.1.0',
    buildNumber: '9',
    notes: 'Novedades',
    waitOpts: { sleep: async () => {} },
  });

  assert.equal(result.status, 'submitted');
  assert.equal(result.phasedReleaseId, 'ph1');

  // Order matters: the build must be attached before the submission is sent,
  // or Apple reviews a version with no binary.
  const seq = calls.map((c) => `${c.method} ${c.path.split('?')[0]}`);
  const attach = seq.indexOf('PATCH /appStoreVersions/v1/relationships/build');
  const submit = seq.indexOf('PATCH /reviewSubmissions/s1');
  assert.ok(attach !== -1 && submit !== -1 && attach < submit, seq.join('\n'));

  const finalPatch = calls.find((c) => c.path === '/reviewSubmissions/s1');
  assert.equal(finalPatch.body.data.attributes.submitted, true);
});

test('submitIosForReview reuses an already-open review submission', async () => {
  // Retrying after a partial failure must not 409 on a duplicate submission.
  const { request, calls } = fakeAsc([
    [/^GET \/builds/, { data: [{ id: 'b9', attributes: { version: '9', processingState: 'VALID' } }] }],
    [/^GET \/apps\/app1\/appStoreVersions/, { data: [] }],
    [/^POST \/appStoreVersions$/, { data: { id: 'v1' } }],
    [/^GET \/appStoreVersions\/v1\/appStoreVersionLocalizations/, { data: [] }],
    [/^POST \/appStoreVersionLocalizations$/, { data: { id: 'loc1' } }],
    [/^PATCH \/appStoreVersions\/v1\/relationships\/build$/, null],
    [/^GET \/appStoreVersions\/v1\/appStoreVersionPhasedRelease$/, { data: { id: 'ph0', attributes: { phasedReleaseState: 'INACTIVE' } } }],
    [/^GET \/apps\/app1\/reviewSubmissions/, { data: [{ id: 'open1' }] }],
    [/^GET \/reviewSubmissions\/open1\/items/, { data: [{ relationships: { appStoreVersion: { data: { id: 'v1' } } } }] }],
    [/^PATCH \/reviewSubmissions\/open1$/, { data: { id: 'open1' } }],
  ]);

  const result = await submitIosForReview({
    request,
    ascAppId: 'app1',
    versionString: '1.1.0',
    buildNumber: '9',
    notes: 'Novedades',
    waitOpts: { sleep: async () => {} },
  });

  assert.equal(result.submissionId, 'open1');
  assert.ok(!calls.some((c) => c.method === 'POST' && c.path === '/reviewSubmissions'));
  assert.ok(!calls.some((c) => c.path === '/reviewSubmissionItems'), 'item already present');
  assert.ok(!calls.some((c) => c.path === '/appStoreVersionPhasedReleases'), 'phased release already set');
});

test('submitIosForReview refuses to publish an empty What\'s New', async () => {
  await assert.rejects(
    submitIosForReview({ request: async () => {}, ascAppId: 'a', versionString: '1.0.0', buildNumber: '9', notes: '  ' }),
    /notes required/,
  );
});

// ── release ───────────────────────────────────────────────────────────────

const PENDING = {
  data: [
    {
      id: 'v1',
      attributes: { versionString: '1.0.0', appStoreState: 'PENDING_DEVELOPER_RELEASE', releaseType: 'MANUAL' },
      relationships: { build: { data: { id: 'b9' } } },
    },
  ],
  included: [{ type: 'builds', id: 'b9', attributes: { version: '9' } }],
};

test('releaseVersion finds the version waiting on the button', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/apps\/app1\/appStoreVersions/, PENDING],
    [/^POST \/appStoreVersionReleaseRequests$/, { data: { id: 'r1' } }],
  ]);
  const result = await releaseVersion(request, { ascAppId: 'app1', apply: true });
  assert.equal(result.status, 'released');
  assert.equal(result.target.versionString, '1.0.0');
  assert.equal(result.target.buildNumber, '9');
  const post = calls.find((c) => c.path === '/appStoreVersionReleaseRequests');
  assert.equal(post.body.data.relationships.appStoreVersion.data.id, 'v1');
});

test('releaseVersion without --apply sends nothing to Apple', async () => {
  const { request, calls } = fakeAsc([[/^GET \/apps\/app1\/appStoreVersions/, PENDING]]);
  const result = await releaseVersion(request, { ascAppId: 'app1', apply: false });
  assert.equal(result.status, 'dry-run');
  assert.ok(!calls.some((c) => c.method === 'POST'), 'a dry run must not write');
});

test('releaseVersion is idempotent on an already-released version', async () => {
  const { request, calls } = fakeAsc([
    [
      /^GET \/apps\/app1\/appStoreVersions/,
      { data: [{ id: 'v1', attributes: { versionString: '1.0.0', appStoreState: 'READY_FOR_SALE' } }] },
    ],
  ]);
  const result = await releaseVersion(request, { ascAppId: 'app1', versionString: '1.0.0', apply: true });
  assert.equal(result.status, 'skipped');
  assert.match(result.message, /already released/);
  assert.ok(!calls.some((c) => c.method === 'POST'));
});

test('releaseVersion reports when nothing is pending', async () => {
  const { request } = fakeAsc([
    [
      /^GET \/apps\/app1\/appStoreVersions/,
      { data: [{ id: 'v1', attributes: { versionString: '1.0.0', appStoreState: 'IN_REVIEW' } }] },
    ],
  ]);
  const result = await releaseVersion(request, { ascAppId: 'app1', apply: true });
  assert.equal(result.status, 'not-found');
});

// ── availability ──────────────────────────────────────────────────────────

const AVAILABILITY_ID = [/^GET \/apps\/app1\/appAvailabilityV2$/, { data: { id: 'av1' } }];

test('getAvailability spots an app that is for sale nowhere', async () => {
  // The failure that made 1.0.0 invisible: approved, released, on sale nowhere.
  const { request } = fakeAsc([
    AVAILABILITY_ID,
    [
      /^GET \/v2\/appAvailabilities\/av1\/territoryAvailabilities/,
      { data: [{ attributes: { available: false } }, { attributes: { available: false } }] },
    ],
  ]);
  const result = await getAvailability(request, { ascAppId: 'app1' });
  assert.equal(result.known, true);
  assert.equal(result.forSale, false);
  assert.equal(result.territories, 0);
});

test('getAvailability counts only the territories actually available', async () => {
  // Every territory is listed; `available` is what separates them.
  const { request } = fakeAsc([
    AVAILABILITY_ID,
    [
      /^GET \/v2\/appAvailabilities\/av1\/territoryAvailabilities/,
      {
        data: [
          { attributes: { available: true } },
          { attributes: { available: true } },
          { attributes: { available: false } },
        ],
      },
    ],
  ]);
  const result = await getAvailability(request, { ascAppId: 'app1' });
  assert.equal(result.territories, 2);
  assert.equal(result.forSale, true);
  assert.equal(result.source, 'appAvailabilityV2');
});

test('getAvailability falls back to the legacy relationship', async () => {
  // Apple moved this resource once already; the chain is why one 404 is not fatal.
  const { request } = fakeAsc([
    [/^GET \/apps\/app1\/availableTerritories/, { data: [{ id: 'ESP' }] }],
  ]);
  const result = await getAvailability(request, { ascAppId: 'app1' });
  assert.equal(result.source, 'availableTerritories');
  assert.equal(result.forSale, true);
});

test('getAvailability degrades instead of killing the status command', async () => {
  // Both shapes gone: report doubt, and say what was tried.
  const { request } = fakeAsc([]);
  const result = await getAvailability(request, { ascAppId: 'app1' });
  assert.equal(result.known, false);
  assert.match(result.reason, /appAvailabilityV2/);
  assert.match(result.reason, /availableTerritories/);
});

test('ascUrl sends versioned paths to their own API version', () => {
  // A v2 resource requested under /v1 fails as "the relationship does not
  // exist", which reads like the resource is gone rather than misaddressed.
  assert.equal(ascUrl('/apps/1'), 'https://api.appstoreconnect.apple.com/v1/apps/1');
  assert.equal(
    ascUrl('/v2/appAvailabilities/1/territoryAvailabilities'),
    'https://api.appstoreconnect.apple.com/v2/appAvailabilities/1/territoryAvailabilities',
  );
});

// ── TestFlight distribution ───────────────────────────────────────────────

const GROUPS = [
  { id: 'g-int', attributes: { name: 'Equipo', isInternalGroup: true, hasAccessToAllBuilds: false } },
  { id: 'g-auto', attributes: { name: 'Todos', isInternalGroup: true, hasAccessToAllBuilds: true } },
  { id: 'g-ext', attributes: { name: 'Vecinos', isInternalGroup: false, hasAccessToAllBuilds: false } },
];

test('pickTestflightGroups defaults to internal groups and skips automatic ones', () => {
  const r = pickTestflightGroups(GROUPS, 'internal');
  assert.deepEqual(r.targets.map((g) => g.id), ['g-int']);
  assert.deepEqual(r.skipped.map((s) => s.name), ['Todos']);
  assert.deepEqual(r.unknown, []);
});

test('pickTestflightGroups selects by name and reports names that do not exist', () => {
  const r = pickTestflightGroups(GROUPS, 'Vecinos, Nadie');
  assert.deepEqual(r.targets.map((g) => g.id), ['g-ext']);
  assert.deepEqual(r.unknown, ['Nadie']);
});

test('pickTestflightGroups "all" includes external groups', () => {
  const r = pickTestflightGroups(GROUPS, 'all');
  assert.deepEqual(r.targets.map((g) => g.id), ['g-int', 'g-ext']);
});

test('distributeToTestflight adds a processed build to each target group', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/apps\/app1\/betaGroups/, { data: GROUPS }],
    [/^GET \/builds/, { data: [{ id: 'b19', attributes: { version: '19', processingState: 'VALID' } }] }],
    [/^POST \/betaGroups\/g-int\/relationships\/builds$/, null],
  ]);
  const result = await distributeToTestflight(request, {
    ascAppId: 'app1',
    buildNumber: '19',
    selector: 'internal',
    apply: true,
    sleep: async () => {},
  });
  assert.equal(result.status, 'distributed');
  const post = calls.find((c) => c.method === 'POST');
  assert.deepEqual(post.body, { data: [{ type: 'builds', id: 'b19' }] });
});

test('distributeToTestflight writes nothing on a dry run', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/apps\/app1\/betaGroups/, { data: GROUPS }],
    [/^GET \/builds/, { data: [{ id: 'b19', attributes: { version: '19', processingState: 'VALID' } }] }],
  ]);
  const result = await distributeToTestflight(request, {
    ascAppId: 'app1',
    buildNumber: '19',
    selector: 'internal',
    apply: false,
    sleep: async () => {},
  });
  assert.equal(result.status, 'dry-run');
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('distributeToTestflight refuses a group name that does not exist', async () => {
  const { request } = fakeAsc([[/^GET \/apps\/app1\/betaGroups/, { data: GROUPS }]]);
  await assert.rejects(
    distributeToTestflight(request, { ascAppId: 'app1', buildNumber: '19', selector: 'Typo', apply: true }),
    /no TestFlight group named: Typo/,
  );
});

test('getBuildBetaState reads the internal and external TestFlight states', async () => {
  const { request } = fakeAsc([
    [/^GET \/builds\?/, { data: [{ id: 'b19', attributes: { version: '19', processingState: 'VALID' } }] }],
    [
      /^GET \/builds\/b19\/buildBetaDetail$/,
      { data: { attributes: { internalBuildState: 'IN_BETA_TESTING', externalBuildState: 'READY_FOR_BETA_SUBMISSION' } } },
    ],
  ]);
  const state = await getBuildBetaState(request, { ascAppId: 'app1', buildNumber: '19' });
  assert.deepEqual(state, { internal: 'IN_BETA_TESTING', external: 'READY_FOR_BETA_SUBMISSION' });
});

// ── external testers + reusing the tested build ───────────────────────────

test('submitForBetaReview writes What to Test and submits the build', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/builds\/b19\/betaBuildLocalizations/, { data: [] }],
    [/^POST \/betaBuildLocalizations$/, { data: { id: 'loc1' } }],
    [/^GET \/builds\/b19\/buildBetaDetail$/, { data: { attributes: { externalBuildState: 'READY_FOR_BETA_SUBMISSION' } } }],
    [/^POST \/betaAppReviewSubmissions$/, { data: { id: 'sub1' } }],
  ]);
  const r = await submitForBetaReview(request, { buildId: 'b19', notes: '- Novedades' });
  assert.equal(r.status, 'submitted');
  const loc = calls.find((c) => c.path === '/betaBuildLocalizations');
  assert.equal(loc.body.data.attributes.whatsNew, '- Novedades');
  assert.equal(loc.body.data.attributes.locale, 'es-ES');
  const sub = calls.find((c) => c.path === '/betaAppReviewSubmissions');
  assert.deepEqual(sub.body.data.relationships.build.data, { type: 'builds', id: 'b19' });
});

test('submitForBetaReview updates an existing What to Test instead of duplicating it', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/builds\/b19\/betaBuildLocalizations/, { data: [{ id: 'loc1', attributes: { locale: 'es-ES' } }] }],
    [/^PATCH \/betaBuildLocalizations\/loc1$/, null],
    [/^GET \/builds\/b19\/buildBetaDetail$/, { data: { attributes: { externalBuildState: 'READY_FOR_BETA_SUBMISSION' } } }],
    [/^POST \/betaAppReviewSubmissions$/, { data: { id: 'sub1' } }],
  ]);
  await submitForBetaReview(request, { buildId: 'b19', notes: 'x' });
  assert.ok(calls.some((c) => c.method === 'PATCH'));
  assert.ok(!calls.some((c) => c.path === '/betaBuildLocalizations' && c.method === 'POST'));
});

test('submitForBetaReview does not resubmit a build already in or past review', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/builds\/b19\/betaBuildLocalizations/, { data: [] }],
    [/^POST \/betaBuildLocalizations$/, { data: { id: 'loc1' } }],
    [/^GET \/builds\/b19\/buildBetaDetail$/, { data: { attributes: { externalBuildState: 'WAITING_FOR_BETA_REVIEW' } } }],
  ]);
  const r = await submitForBetaReview(request, { buildId: 'b19', notes: 'x' });
  assert.equal(r.status, 'noop');
  assert.ok(!calls.some((c) => c.path === '/betaAppReviewSubmissions'));
});

test('distributeToTestflight submits beta review only when an external group is targeted', async () => {
  const routes = [
    [/^GET \/apps\/app1\/betaGroups/, { data: GROUPS }],
    [/^GET \/builds\?/, { data: [{ id: 'b19', attributes: { version: '19', processingState: 'VALID' } }] }],
    [/^POST \/betaGroups\/.*\/relationships\/builds$/, null],
    [/^GET \/builds\/b19\/betaBuildLocalizations/, { data: [] }],
    [/^POST \/betaBuildLocalizations$/, { data: { id: 'loc1' } }],
    [/^GET \/builds\/b19\/buildBetaDetail$/, { data: { attributes: { externalBuildState: 'READY_FOR_BETA_SUBMISSION' } } }],
    [/^POST \/betaAppReviewSubmissions$/, { data: { id: 'sub1' } }],
  ];
  const all = fakeAsc(routes);
  const r = await distributeToTestflight(all.request, {
    ascAppId: 'app1', buildNumber: '19', selector: 'all', apply: true, betaReviewNotes: 'x', sleep: async () => {},
  });
  assert.equal(r.betaReview, 'submitted');

  const internal = fakeAsc(routes);
  await distributeToTestflight(internal.request, {
    ascAppId: 'app1', buildNumber: '19', selector: 'Equipo', apply: true, betaReviewNotes: 'x', sleep: async () => {},
  });
  assert.ok(!internal.calls.some((c) => c.path === '/betaAppReviewSubmissions'));
});

test('latestBuildForVersion picks the newest processed build of a marketing version', async () => {
  const { request, calls } = fakeAsc([
    [/^GET \/builds\?/, { data: [{ id: 'b21', attributes: { version: '21', processingState: 'VALID' } }] }],
  ]);
  assert.equal(await latestBuildForVersion(request, { ascAppId: 'app1', versionString: '1.5.0' }), '21');
  assert.match(calls[0].path, /filter\[preReleaseVersion\.version\]=1\.5\.0/);
  assert.match(calls[0].path, /sort=-uploadedDate/);
});

test('latestBuildForVersion returns null when the version has no build', async () => {
  const { request } = fakeAsc([[/^GET \/builds\?/, { data: [] }]]);
  assert.equal(await latestBuildForVersion(request, { ascAppId: 'app1', versionString: '9.9.9' }), null);
});

test('submitForBetaReview reports a version already closed to beta review instead of failing', async () => {
  // Apple closes a version to Beta App Review once it is submitted for App
  // Store review; the upload and internal testing are unaffected.
  const { request } = fakeAsc([
    [/^GET \/builds\/b19\/betaBuildLocalizations/, { data: [] }],
    [/^POST \/betaBuildLocalizations$/, { data: { id: 'loc1' } }],
    [/^GET \/builds\/b19\/buildBetaDetail$/, { data: { attributes: { externalBuildState: 'READY_FOR_BETA_SUBMISSION' } } }],
    [
      /^POST \/betaAppReviewSubmissions$/,
      () => {
        throw new Error(
          'ASC API POST /betaAppReviewSubmissions failed (422): This version and prior versions are closed for beta review submission.',
        );
      },
    ],
  ]);
  const r = await submitForBetaReview(request, { buildId: 'b19', notes: 'x' });
  assert.equal(r.status, 'version-closed');
});
