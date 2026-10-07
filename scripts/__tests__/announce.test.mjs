// Announce-when-live: the hold decision, the pending doc's life from deploy to
// done, and the store answers — against a fake Firestore, a fake Play and a
// fake App Store Connect. No network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  announcedVersion,
  decideAndroidLive,
  decideBackendHold,
  DEPLOY_RETRY_HOURS,
  interpretIosVersions,
  interpretPlayLifecycle,
  interpretPlayTrack,
  nextPending,
  parseHoldFlag,
  pendingDocPath,
  PLAY_LIFECYCLE,
  planTick,
  playTargetFrom,
} from '../lib/announce.mjs';
import {
  applyTick,
  checkStores,
  CONFIG_DOC,
  finishHeldDeploy,
  recordAndroidBuild,
  recordRelease,
} from '../lib/announce-store.mjs';
import { makePlayClient } from '../lib/play.mjs';

const config = (ios, android, min = '0.0.0') => ({
  ios: { latest: ios, minSupported: min },
  android: { latest: android, minSupported: min },
  storeUrl: { ios: 'https://apps.apple.com/x', android: 'https://play.google.com/x' },
});
const BREAKING = { breaking: true, reasons: ['removes the v1 callable'] };
const CLEAN = { breaking: false, reasons: [] };

/** Firestore, as much of it as the announce code touches. */
function fakeDb(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const snap = (p) => ({ exists: docs.has(p), data: () => structuredClone(docs.get(p)) });
  return {
    docs,
    doc: (p) => ({ path: p, get: async () => snap(p) }),
    runTransaction: async (fn) =>
      fn({
        get: async (ref) => snap(ref.path),
        set: (ref, data) => docs.set(ref.path, structuredClone(data)),
        delete: (ref) => docs.delete(ref.path),
      }),
  };
}

describe('pendingDocPath', () => {
  // An odd segment count is a collection, and db.doc() throws on it at runtime.
  it('names a document (even segment count) under _admin', () => {
    const p = pendingDocPath('prod');
    assert.equal(p, '_admin/announce/pending/prod');
    assert.equal(p.split('/').length % 2, 0);
  });
});

describe('announcedVersion', () => {
  it('is the lower of the two platforms — what both stores serve', () => {
    assert.equal(announcedVersion(config('1.4.1', '1.5.0')), '1.4.1');
  });

  it('is null when the doc is absent or malformed, so everything is in flight', () => {
    assert.equal(announcedVersion(null), null);
    assert.equal(announcedVersion({ ios: { latest: '1.4' }, android: { latest: '1.5.0' } }), null);
  });
});

describe('decideBackendHold', () => {
  const base = { env: 'prod', version: '1.6.0', config: config('1.5.0', '1.5.0'), pending: null };

  it('holds a breaking release that the stores do not serve yet', () => {
    const d = decideBackendHold({ ...base, rollup: BREAKING });
    assert.equal(d.hold, true);
    assert.equal(d.inFlight, true);
    assert.deepEqual(d.reasons, ['removes the v1 callable']);
  });

  it('deploys a non-breaking release immediately', () => {
    assert.equal(decideBackendHold({ ...base, rollup: CLEAN }).hold, false);
  });

  it('never holds beta or dev', () => {
    for (const env of ['beta', 'dev']) assert.equal(decideBackendHold({ ...base, env, rollup: BREAKING }).hold, false);
  });

  it('[auto-deploy] in the merge commit overrides the hold', () => {
    const d = decideBackendHold({ ...base, rollup: BREAKING, commitMessage: 'Merge pull request #9 from x/beta\n\n1.6.0 [auto-deploy]' });
    assert.equal(d.hold, false);
    assert.equal(d.breaking, true);
  });

  // Holding with no binary on the way would hold forever.
  it('does not hold when nothing is in flight', () => {
    const d = decideBackendHold({ ...base, config: config('1.6.0', '1.6.0'), rollup: BREAKING });
    assert.equal(d.hold, false);
    assert.equal(d.inFlight, false);
  });

  it('counts a version live on only one store as still in flight', () => {
    const d = decideBackendHold({ ...base, config: config('1.6.0', '1.5.0'), rollup: BREAKING });
    assert.equal(d.hold, true);
  });

  // The supersession hole: a non-breaking 1.7.0 contains 1.6.0's breaking
  // commits but its own rollup range does not, so without stickiness it would
  // deploy them before 1.6.0 was ever live.
  it('stays held while an earlier held release is pending', () => {
    const pending = { version: '1.6.0', holdBackend: true, breaking: true, reasons: ['removes the v1 callable'] };
    const d = decideBackendHold({ ...base, version: '1.7.0', pending, rollup: CLEAN });
    assert.equal(d.hold, true);
    assert.deepEqual(d.reasons, ['removes the v1 callable']);
  });

  it('is in flight when nothing was ever announced', () => {
    assert.equal(decideBackendHold({ ...base, config: null, rollup: BREAKING }).hold, true);
  });
});

describe('nextPending', () => {
  const now = '2026-10-06T10:00:00.000Z';

  it('records a new release', () => {
    const doc = nextPending(null, { version: '1.6.0', sha: 'aaa', ...BREAKING, hold: true, now });
    assert.equal(doc.version, '1.6.0');
    assert.equal(doc.releaseSha, 'aaa');
    assert.equal(doc.backendSha, 'aaa');
    assert.equal(doc.holdBackend, true);
    assert.deepEqual(doc.announced, { ios: false, android: false });
    assert.equal(doc.androidVersionCode, null);
  });

  // A hotfix merge without a bump: the held backend must ship the newest commit,
  // and what the poller already learned must survive.
  it('keeps what the poller learned when the same version is deployed again', () => {
    const first = { ...nextPending(null, { version: '1.6.0', sha: 'aaa', ...BREAKING, hold: true, now }), announced: { ios: true, android: false }, androidVersionCode: '42' };
    const doc = nextPending(first, { version: '1.6.0', sha: 'bbb', ...CLEAN, hold: true, now });
    assert.equal(doc.releaseSha, 'aaa');
    assert.equal(doc.backendSha, 'bbb');
    assert.deepEqual(doc.announced, { ios: true, android: false });
    assert.equal(doc.androidVersionCode, '42');
    assert.equal(doc.breaking, true);
  });

  it('hands an unannounced breaking release on to the version that supersedes it', () => {
    const old = nextPending(null, { version: '1.6.0', sha: 'aaa', ...BREAKING, hold: true, now });
    const doc = nextPending(old, { version: '1.7.0', sha: 'ccc', ...CLEAN, hold: true, now });
    assert.equal(doc.version, '1.7.0');
    assert.equal(doc.breaking, true);
    assert.deepEqual(doc.reasons, ['removes the v1 callable']);
    assert.equal(doc.supersedes, '1.6.0');
    assert.deepEqual(doc.announced, { ios: false, android: false });
  });
});

describe('planTick', () => {
  const pending = { version: '1.6.0', breaking: true, holdBackend: true, backendSha: 'bbb', announced: { ios: false, android: false } };

  it('waits while neither store serves it', () => {
    const p = planTick(pending, { live: { ios: false, android: false }, stored: config('1.5.0', '1.5.0') });
    assert.equal(p.config, null);
    assert.equal(p.deploySha, null);
    assert.equal(p.clear, false);
    assert.deepEqual(p.waitingOn, ['ios', 'android']);
  });

  // Each platform on its own: an iOS approval does not wait for Play.
  it('announces one platform without raising the wall or releasing the backend', () => {
    const p = planTick(pending, { live: { ios: true, android: false }, stored: config('1.5.0', '1.5.0') });
    assert.deepEqual(p.config, { latestFor: { ios: '1.6.0' }, minSupported: undefined });
    assert.equal(p.deploySha, null);
    assert.deepEqual(p.announced, { ios: true, android: false });
  });

  it('raises the wall and releases the held backend once both are live', () => {
    const p = planTick({ ...pending, announced: { ios: true, android: false } }, { live: { ios: true, android: true }, stored: config('1.6.0', '1.5.0') });
    assert.deepEqual(p.config, { latestFor: { android: '1.6.0' }, minSupported: '1.6.0' });
    assert.equal(p.deploySha, 'bbb');
    assert.equal(p.clear, false);
  });

  it('clears a non-breaking release once both are live', () => {
    const p = planTick({ ...pending, breaking: false, holdBackend: false }, { live: { ios: true, android: true }, stored: config('1.5.0', '1.5.0') });
    assert.equal(p.config.minSupported, undefined);
    assert.equal(p.deploySha, null);
    assert.equal(p.clear, true);
  });

  it('never lowers latest or the wall', () => {
    const p = planTick(pending, { live: { ios: true, android: true }, stored: config('1.7.0', '1.5.0', '1.7.0') });
    assert.equal(p.config.latestFor.ios, '1.7.0');
    assert.equal(p.config.minSupported, '1.7.0');
  });
});

describe('interpretPlayTrack', () => {
  const track = {
    releases: [
      { name: '41 (1.5.0)', versionCodes: ['41'], status: 'completed' },
      { name: '1.6.0', versionCodes: ['42'], status: 'inProgress', userFraction: 0.2 },
    ],
  };

  it('matches the recorded versionCode and requires a full rollout', () => {
    assert.deepEqual(
      { ...interpretPlayTrack(track, { versionCode: 42, version: '1.6.0' }) },
      { found: true, fullRollout: false, status: 'inProgress', userFraction: 0.2, versionCodes: ['42'], via: 'versionCode' },
    );
  });

  // Play drops userFraction once a staged rollout reaches 100%.
  it('treats a completed release with no fraction as a full rollout', () => {
    assert.equal(interpretPlayTrack(track, { versionCode: '41', version: '1.5.0' }).fullRollout, true);
  });

  it('falls back to the release name when no versionCode was recorded', () => {
    const r = interpretPlayTrack(track, { versionCode: null, version: '1.5.0' });
    assert.equal(r.fullRollout, true);
    assert.equal(r.via, 'name');
  });

  it('does not fall back to the name when a recorded versionCode matches nothing', () => {
    assert.equal(interpretPlayTrack(track, { versionCode: '40', version: '1.5.0' }).found, false);
  });

  it('does not match a longer version by name', () => {
    assert.equal(interpretPlayTrack({ releases: [{ name: '1.5.01', status: 'completed' }] }, { version: '1.5.0' }).found, false);
  });

  it('is not found when the version is not on the track', () => {
    assert.equal(interpretPlayTrack({ releases: [] }, { versionCode: '99', version: '9.9.9' }).found, false);
  });
});

describe('interpretPlayLifecycle', () => {
  const list = {
    releases: [
      { releaseName: '1.5.0', activeArtifacts: [{ versionCode: '41' }], releaseLifecycleState: PLAY_LIFECYCLE.PUBLISHED },
      { releaseName: '1.6.0', activeArtifacts: [{ versionCode: 42 }], releaseLifecycleState: PLAY_LIFECYCLE.IN_REVIEW },
    ],
  };

  it('matches the recorded versionCode among the active artifacts (string or number)', () => {
    const r = interpretPlayLifecycle(list, { versionCode: '42', version: '1.6.0' });
    assert.deepEqual(
      { found: r.found, published: r.published, state: r.state, versionCodes: r.versionCodes, via: r.via },
      { found: true, published: false, state: PLAY_LIFECYCLE.IN_REVIEW, versionCodes: ['42'], via: 'versionCode' },
    );
  });

  it('a versionCode mismatch is not found, even when a release carries the version name', () => {
    const r = interpretPlayLifecycle(list, { versionCode: '43', version: '1.6.0' });
    assert.equal(r.found, false);
    assert.equal(r.published, false);
  });

  it('falls back to the release name without a recorded versionCode', () => {
    const r = interpretPlayLifecycle(list, { versionCode: null, version: '1.5.0' });
    assert.equal(r.published, true);
    assert.deepEqual(r.versionCodes, ['41']);
    assert.equal(r.via, 'name');
  });

  it('flags NOT_APPROVED as rejected and an unheard-of state as unknown', () => {
    const one = (state) => interpretPlayLifecycle({ releases: [{ releaseName: '1.6.0', activeArtifacts: [{ versionCode: '42' }], releaseLifecycleState: state }] }, { versionCode: '42', version: '1.6.0' });
    assert.equal(one(PLAY_LIFECYCLE.NOT_APPROVED).rejected, true);
    assert.equal(one(PLAY_LIFECYCLE.NOT_APPROVED).published, false);
    assert.equal(one('RELEASE_LIFECYCLE_STATE_UNSPECIFIED').known, false);
    assert.equal(one(undefined).known, false);
  });

  it('an empty answer is not found', () => {
    assert.equal(interpretPlayLifecycle({}, { versionCode: '42', version: '1.6.0' }).found, false);
  });
});

describe('decideAndroidLive', () => {
  const lifecycle = (state) => ({ found: true, published: state === PLAY_LIFECYCLE.PUBLISHED, rejected: state === PLAY_LIFECYCLE.NOT_APPROVED, known: true, state, via: 'versionCode' });
  const rollout = (fullRollout, status = 'completed', userFraction = 1) => ({ found: true, fullRollout, status, userFraction });

  it('is live only when PUBLISHED and fully rolled out', () => {
    assert.equal(decideAndroidLive({ lifecycle: lifecycle(PLAY_LIFECYCLE.PUBLISHED), rollout: rollout(true) }).live, true);
    assert.equal(decideAndroidLive({ lifecycle: lifecycle(PLAY_LIFECYCLE.PUBLISHED), rollout: rollout(false, 'inProgress', 0.5) }).live, false);
    assert.equal(decideAndroidLive({ lifecycle: lifecycle(PLAY_LIFECYCLE.APPROVED_NOT_PUBLISHED), rollout: rollout(true) }).live, false);
  });

  it('a PUBLISHED release missing from the edits track is not live, and unknown', () => {
    const r = decideAndroidLive({ lifecycle: lifecycle(PLAY_LIFECYCLE.PUBLISHED), rollout: { found: false } });
    assert.equal(r.live, false);
    assert.equal(r.unknown, true);
  });

  it('a rejection is reported as such', () => {
    const r = decideAndroidLive({ lifecycle: lifecycle(PLAY_LIFECYCLE.NOT_APPROVED), rollout: null });
    assert.deepEqual([r.live, r.rejected], [false, true]);
  });
});

describe('interpretIosVersions', () => {
  const versions = [
    { versionString: '1.6.0', appStoreState: 'WAITING_FOR_REVIEW', buildNumber: '7' },
    { versionString: '1.5.0', appStoreState: 'READY_FOR_SALE', buildNumber: '6' },
  ];

  it('is live only when the version is on sale', () => {
    assert.equal(interpretIosVersions(versions, '1.6.0').live, false);
    assert.deepEqual(interpretIosVersions(versions, '1.5.0'), { found: true, live: true, approved: true, state: 'READY_FOR_SALE', buildNumber: '6' });
  });

  // A manual release (breaking) waits here after App Review: approved, not live.
  it('is approved but not live while waiting for its manual release', () => {
    const r = interpretIosVersions([{ versionString: '1.6.0', appStoreState: 'PENDING_DEVELOPER_RELEASE' }], '1.6.0');
    assert.equal(r.live, false);
    assert.equal(r.approved, true);
    assert.equal(interpretIosVersions(versions, '1.6.0').approved, false);
  });

  it('accepts the newer READY_FOR_DISTRIBUTION name for the same state', () => {
    assert.equal(interpretIosVersions([{ versionString: '1.6.0', appStoreState: 'READY_FOR_DISTRIBUTION' }], '1.6.0').live, true);
  });
});

describe('checkStores — fails safe', () => {
  const pending = { version: '1.6.0', androidVersionCode: '42', announced: { ios: false, android: false } };
  const target = { packageName: 'com.cultuvilla.app', track: 'production' };
  const fakeAsc = (versions) => async (method, path) => {
    assert.equal(method, 'GET');
    // Filtered by version server-side: ASC promises no order for a page of versions.
    assert.match(path, /^\/apps\/app1\/appStoreVersions\?.*filter\[versionString\]=1\.6\.0/);
    return {
      data: versions.map((v, i) => ({ id: `v${i}`, attributes: { versionString: v.versionString, appStoreState: v.state }, relationships: { build: { data: { id: `b${i}` } } } })),
      included: versions.map((v, i) => ({ type: 'builds', id: `b${i}`, attributes: { version: v.build } })),
    };
  };

  /** A fake Play: the lifecycle of release 42, and its rollout on the edits track. */
  const fakePlay = ({ state = PLAY_LIFECYCLE.PUBLISHED, status = 'completed', userFraction, calls = [] } = {}) => () => ({
    listReleases: async (pkg, track) => {
      calls.push(`list ${pkg} ${track}`);
      return { releases: [{ releaseName: '1.6.0', track, activeArtifacts: [{ versionCode: '42' }], releaseLifecycleState: state }] };
    },
    getTrack: async (pkg, track) => {
      calls.push(`track ${pkg} ${track}`);
      return { track, releases: [{ name: '1.6.0', versionCodes: ['42'], status, ...(userFraction ? { userFraction } : {}) }] };
    },
  });
  const onSale = () => fakeAsc([{ versionString: '1.6.0', state: 'READY_FOR_SALE', build: '7' }]);

  it('reports both live when App Store sells it and Play has published it at full rollout', async () => {
    const r = await checkStores({ pending, makePlay: fakePlay(), makeAsc: onSale, ascAppId: 'app1', ...target });
    assert.deepEqual(r.live, { ios: true, android: true });
    assert.equal(r.detail.iosBuildNumber, '7');
    assert.match(r.detail.android, /PUBLISHED, completed at 100%/);
  });

  // eas.json submits with releaseStatus: completed, so the edits track reads
  // `completed` while Google still reviews. The lifecycle is what counts.
  for (const state of ['DRAFT', 'NOT_SENT_FOR_REVIEW', 'IN_REVIEW', 'APPROVED_NOT_PUBLISHED']) {
    it(`a ${state} release is not live, and is not worth a warning`, async () => {
      const warnings = [];
      const calls = [];
      const r = await checkStores({ pending, makePlay: fakePlay({ state: PLAY_LIFECYCLE[state], calls }), makeAsc: onSale, ascAppId: 'app1', ...target, warn: (m) => warnings.push(m) });
      assert.equal(r.live.android, false);
      assert.equal(r.approved.android, state === 'APPROVED_NOT_PUBLISHED');
      assert.equal(r.awaitingPublish.android, state === 'APPROVED_NOT_PUBLISHED');
      assert.match(r.detail.android, state === 'APPROVED_NOT_PUBLISHED' ? /approved, waiting for Publish/ : new RegExp(`${state} — not published yet`));
      assert.deepEqual(warnings, []);
      assert.deepEqual(calls, ['list com.cultuvilla.app production'], 'no edit is opened before Google publishes');
    });
  }

  it('a rejected release is not live, and warns loudly', async () => {
    const warnings = [];
    const r = await checkStores({ pending, makePlay: fakePlay({ state: PLAY_LIFECYCLE.NOT_APPROVED }), makeAsc: onSale, ascAppId: 'app1', ...target, warn: (m) => warnings.push(m) });
    assert.equal(r.live.android, false);
    assert.equal(r.detail.androidRejected, true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /REJECTED v1\.6\.0/);
  });

  // PUBLISHED also covers a staged or halted rollout.
  it('a published release on a partial rollout is not live', async () => {
    const r = await checkStores({ pending, makePlay: fakePlay({ status: 'inProgress', userFraction: 0.2 }), makeAsc: onSale, ascAppId: 'app1', ...target });
    assert.equal(r.live.android, false);
    assert.match(r.detail.android, /inProgress at 20%/);
  });

  it('a published release that was halted is not live', async () => {
    const r = await checkStores({ pending, makePlay: fakePlay({ status: 'halted', userFraction: 0.5 }), makeAsc: onSale, ascAppId: 'app1', ...target });
    assert.equal(r.live.android, false);
  });

  it('a versionCode that matches no release is not live', async () => {
    const r = await checkStores({ pending: { ...pending, androidVersionCode: '43' }, makePlay: fakePlay(), makeAsc: onSale, ascAppId: 'app1', ...target });
    assert.equal(r.live.android, false);
    assert.match(r.detail.android, /not on the production track yet \(looked up by versionCode\)/);
  });

  it('falls back to the release name without a recorded versionCode, then checks that build’s rollout', async () => {
    const r = await checkStores({ pending: { ...pending, androidVersionCode: null }, makePlay: fakePlay(), makeAsc: onSale, ascAppId: 'app1', ...target });
    assert.equal(r.live.android, true);
    assert.match(r.detail.android, /matched by name/);
  });

  it('an unknown lifecycle state is not live, and warns', async () => {
    const warnings = [];
    const r = await checkStores({ pending, makePlay: fakePlay({ state: 'RELEASE_LIFECYCLE_STATE_SOMETHING_NEW' }), makeAsc: onSale, ascAppId: 'app1', ...target, warn: (m) => warnings.push(m) });
    assert.equal(r.live.android, false);
    assert.equal(warnings.length, 1);
  });

  it('treats missing credentials as not live, and warns', async () => {
    const warnings = [];
    const r = await checkStores({ pending, makePlay: () => null, makeAsc: () => null, ascAppId: 'app1', ...target, warn: (m) => warnings.push(m) });
    assert.deepEqual(r.live, { ios: false, android: false });
    assert.equal(warnings.length, 2);
  });

  // A corrupt secret throws while the client is BUILT; that must cost a
  // warning, not a red run every 30 minutes.
  it('treats malformed credentials as not live, and warns', async () => {
    const warnings = [];
    const r = await checkStores({
      pending,
      makePlay: () => makePlayClient({ serviceAccountJson: '{not json' }),
      makeAsc: () => { throw new Error('bad .p8'); },
      ascAppId: 'app1',
      ...target,
      warn: (m) => warnings.push(m),
    });
    assert.deepEqual(r.live, { ios: false, android: false });
    assert.equal(warnings.length, 2);
  });

  it('treats an API error as not live, and warns', async () => {
    const warnings = [];
    const failing = async () => { throw new Error('503'); };
    const r = await checkStores({ pending, makePlay: () => ({ listReleases: failing, getTrack: failing }), makeAsc: () => failing, ascAppId: 'app1', ...target, warn: (m) => warnings.push(m) });
    assert.deepEqual(r.live, { ios: false, android: false });
    assert.equal(warnings.length, 2);
  });

  it('does not ask a store about a platform already announced', async () => {
    const boom = () => { throw new Error('should not be called'); };
    const r = await checkStores({ pending: { ...pending, announced: { ios: true, android: true } }, makePlay: boom, makeAsc: boom, ...target });
    assert.deepEqual(r.live, { ios: true, android: true });
  });
});

describe('parseHoldFlag', () => {
  // The plan step's output crosses into the record step as a string; a lenient
  // parse would record a held release as unheld and its backend would never ship.
  it('round-trips exactly what the plan step writes, and refuses anything else', () => {
    assert.equal(parseHoldFlag('true'), true);
    assert.equal(parseHoldFlag('false'), false);
    for (const bad of ['', 'True', '1', undefined, 'yes']) assert.throws(() => parseHoldFlag(bad), /--hold must be/);
  });
});

describe('playTargetFrom', () => {
  it('reads the production Play target from the real eas.json', () => {
    const eas = JSON.parse(readFileSync(path.resolve(fileURLToPath(import.meta.url), '../../../apps/mobile/eas.json'), 'utf8'));
    assert.deepEqual(playTargetFrom(eas), { packageName: 'com.cultuvilla.app', track: 'production' });
  });

  it('throws when the target is missing, rather than polling nothing', () => {
    assert.throws(() => playTargetFrom({ submit: {} }), /applicationId and track/);
  });
});

describe('pending lifecycle (fake Firestore)', () => {
  const env = 'prod';
  const P = pendingDocPath(env);

  it('goes recorded → one platform → both live → wall + backend dispatched → deployed → cleared', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') });
    const decision = decideBackendHold({ env, version: '1.6.0', config: config('1.5.0', '1.5.0'), rollup: BREAKING, pending: null });

    await recordRelease(db, { env, version: '1.6.0', sha: 'aaa', decision, now: '2026-10-06T00:00:00Z' });
    assert.equal(db.docs.get(P).holdBackend, true);

    assert.equal((await recordAndroidBuild(db, { env, version: '1.6.0', versionCode: 42 })).outcome, 'recorded');
    assert.equal(db.docs.get(P).androidVersionCode, '42');

    let r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: false } });
    assert.equal(r.outcome, 'waiting');
    assert.equal(db.docs.get(CONFIG_DOC).ios.latest, '1.6.0');
    assert.equal(db.docs.get(CONFIG_DOC).android.latest, '1.5.0');
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '0.0.0');

    const t0 = Date.parse('2026-10-08T00:00:00Z');
    r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true }, now: t0 });
    assert.equal(r.outcome, 'deploy');
    assert.equal(r.plan.deploySha, 'aaa');
    assert.deepEqual(db.docs.get(CONFIG_DOC).android, { latest: '1.6.0', minSupported: '1.6.0' });
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '1.6.0');
    assert.ok(db.docs.has(P), 'kept until the deploy itself succeeds');

    // Dispatched, not yet deployed: the next tick waits rather than re-dispatching…
    r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true }, now: t0 + 3_600_000 });
    assert.equal(r.outcome, 'awaiting-deploy');
    assert.equal(r.plan.deploySha, null);

    // …and a deploy that never finished (failed a gate) is dispatched again.
    r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true }, now: t0 + (DEPLOY_RETRY_HOURS + 1) * 3_600_000 });
    assert.equal(r.plan.deploySha, 'aaa');
    assert.equal(r.plan.retry, true);

    assert.equal((await finishHeldDeploy(db, { env, sha: 'other' })).outcome, 'other-sha');
    assert.ok(db.docs.has(P));
    assert.equal((await finishHeldDeploy(db, { env, sha: 'aaa' })).outcome, 'done');
    assert.ok(!db.docs.has(P));
  });

  // Dispatching Deploy prod by hand releases a held backend early; the
  // announce still waits for the stores.
  it('keeps announcing after a held backend is released early by hand', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') });
    const decision = decideBackendHold({ env, version: '1.6.0', config: config('1.5.0', '1.5.0'), rollup: BREAKING, pending: null });
    await recordRelease(db, { env, version: '1.6.0', sha: 'aaa', decision });
    assert.equal((await finishHeldDeploy(db, { env, sha: 'aaa' })).outcome, 'released-early');
    assert.equal(db.docs.get(P).holdBackend, false);
    const r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true } });
    assert.equal(r.outcome, 'done');
    assert.equal(r.plan.deploySha, null);
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '1.6.0', 'the wall still rises');
  });

  it('clears a non-breaking release as soon as both stores serve it', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') });
    const decision = decideBackendHold({ env, version: '1.6.0', config: config('1.5.0', '1.5.0'), rollup: CLEAN, pending: null });
    await recordRelease(db, { env, version: '1.6.0', sha: 'aaa', decision });
    const r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true } });
    assert.equal(r.outcome, 'done');
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '0.0.0');
    assert.ok(!db.docs.has(P));
  });

  it('records nothing for a version both stores already serve', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.6.0', '1.6.0') });
    const decision = decideBackendHold({ env, version: '1.6.0', config: config('1.6.0', '1.6.0'), rollup: CLEAN, pending: null });
    assert.equal((await recordRelease(db, { env, version: '1.6.0', sha: 'aaa', decision })).outcome, 'not-in-flight');
    assert.ok(!db.docs.has(P));
  });

  it('writes nothing for a release that was superseded during the store check', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: { version: '1.7.0', announced: { ios: false, android: false } } });
    const r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true } });
    assert.equal(r.outcome, 'superseded');
    assert.equal(db.docs.get(CONFIG_DOC).ios.latest, '1.5.0');
  });

  it('a dry run writes nothing', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: { version: '1.6.0', breaking: true, holdBackend: true, backendSha: 'a', announced: { ios: false, android: false } } });
    const r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true }, dryRun: true });
    assert.equal(r.outcome, 'dry-run');
    assert.equal(r.payload.ios.minSupported, '1.6.0');
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '0.0.0');
  });

  it('ignores a versionCode for a version that is no longer pending', async () => {
    const db = fakeDb({ [P]: { version: '1.7.0' } });
    assert.equal((await recordAndroidBuild(db, { env, version: '1.6.0', versionCode: 42 })).outcome, 'other-version');
  });
});

describe('makePlayClient', () => {
  it('is null without credentials, so the caller reads "not live"', () => {
    assert.equal(makePlayClient({ serviceAccountJson: '' }), null);
  });

  it('opens an edit, reads the track, and deletes the edit without committing', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const sa = JSON.stringify({ client_email: 'p@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(`${init.method} ${url.replace(/^https:\/\/[^/]+/, '')}`);
      const json = (body, status = 200) => ({ ok: true, status, json: async () => body, text: async () => '' });
      if (url.includes('oauth2')) return json({ access_token: 't' });
      if (init.method === 'POST') return json({ id: 'e1' });
      if (init.method === 'DELETE') return json(null, 204);
      return json({ track: 'production', releases: [] });
    };
    const track = await makePlayClient({ serviceAccountJson: sa, fetchImpl }).getTrack('com.cultuvilla.app', 'production');
    assert.deepEqual(track, { track: 'production', releases: [] });
    assert.deepEqual(calls.slice(1), [
      'POST /androidpublisher/v3/applications/com.cultuvilla.app/edits',
      'GET /androidpublisher/v3/applications/com.cultuvilla.app/edits/e1/tracks/production',
      'DELETE /androidpublisher/v3/applications/com.cultuvilla.app/edits/e1',
    ]);
    assert.ok(!calls.some((c) => c.includes(':commit')));
  });

  it('lists the track’s release lifecycle without opening an edit, on the androidpublisher scope', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const sa = JSON.stringify({ client_email: 'p@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    const calls = [];
    let scope;
    const body = { releases: [{ releaseName: '1.6.0', activeArtifacts: [{ versionCode: '42' }], releaseLifecycleState: PLAY_LIFECYCLE.IN_REVIEW }] };
    const fetchImpl = async (url, init) => {
      calls.push(`${init.method} ${url.replace(/^https:\/\/[^/]+/, '')}`);
      const json = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => '' });
      if (url.includes('oauth2')) {
        const claims = new URLSearchParams(init.body).get('assertion').split('.')[1];
        scope = JSON.parse(Buffer.from(claims, 'base64url').toString()).scope;
        return json({ access_token: 't' });
      }
      return json(body);
    };
    const list = await makePlayClient({ serviceAccountJson: sa, fetchImpl }).listReleases('com.cultuvilla.app', 'production');
    assert.deepEqual(list, body);
    assert.equal(scope, 'https://www.googleapis.com/auth/androidpublisher');
    assert.deepEqual(calls.slice(1), ['GET /androidpublisher/v3/applications/com.cultuvilla.app/tracks/production/releases']);
  });
});

describe('beta: announced and walled on Android alone, never held', () => {
  const betaPending = {
    version: '1.8.0',
    breaking: true,
    reasons: ['r'],
    holdBackend: false,
    platforms: ['android'],
    announced: { ios: false, android: false },
  };
  const stored = { ios: { latest: '1.4.1', minSupported: '0.0.0' }, android: { latest: '1.7.1', minSupported: '0.0.0' } };

  it('announces and walls once the beta app is live, and finishes without iOS', () => {
    const plan = planTick(betaPending, { live: { android: true, ios: false }, stored });
    assert.deepEqual(plan.config, { latestFor: { android: '1.8.0' }, minSupported: '1.8.0' });
    assert.equal(plan.clear, true);
    assert.deepEqual(plan.waitingOn, []);
    assert.equal(plan.deploySha, null);
  });

  it('never moves iOS, even if a store answer says live', () => {
    const plan = planTick(betaPending, { live: { android: false, ios: true }, stored });
    assert.equal(plan.config, null);
    assert.deepEqual(plan.waitingOn, ['android']);
  });

  it('never holds, but still reads the merge as breaking', () => {
    const d = decideBackendHold({ env: 'beta', version: '1.8.0', config: stored, rollup: { breaking: true, reasons: ['r'] } });
    assert.equal(d.hold, false);
    assert.equal(d.breaking, true);
    assert.equal(d.inFlight, true, 'ahead of what the beta app has announced (iOS is not counted)');
  });
});
