// Announce-when-live: the hold decision, the pending doc's life from deploy to
// done, and the store answers — against a fake Firestore, a fake Play and a
// fake App Store Connect. No network.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  announcedVersion,
  decideBackendHold,
  interpretIosVersions,
  interpretPlayTrack,
  nextPending,
  pendingDocPath,
  planTick,
} from '../lib/announce.mjs';
import {
  applyTick,
  checkStores,
  CONFIG_DOC,
  finishAfterDispatch,
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
      { found: true, live: false, status: 'inProgress', userFraction: 0.2, versionCodes: ['42'], via: 'versionCode' },
    );
  });

  // Play drops userFraction once a staged rollout reaches 100%.
  it('treats a completed release with no fraction as fully live', () => {
    assert.equal(interpretPlayTrack(track, { versionCode: '41', version: '1.5.0' }).live, true);
  });

  it('falls back to the release name when no versionCode was recorded', () => {
    const r = interpretPlayTrack(track, { versionCode: null, version: '1.5.0' });
    assert.equal(r.live, true);
    assert.equal(r.via, 'name');
  });

  it('does not match a longer version by name', () => {
    assert.equal(interpretPlayTrack({ releases: [{ name: '1.5.01', status: 'completed' }] }, { version: '1.5.0' }).found, false);
  });

  it('is not live when the version is not on the track', () => {
    assert.deepEqual(interpretPlayTrack({ releases: [] }, { versionCode: '99', version: '9.9.9' }).live, false);
  });
});

describe('interpretIosVersions', () => {
  const versions = [
    { versionString: '1.6.0', appStoreState: 'WAITING_FOR_REVIEW', buildNumber: '7' },
    { versionString: '1.5.0', appStoreState: 'READY_FOR_SALE', buildNumber: '6' },
  ];

  it('is live only when the version is on sale', () => {
    assert.equal(interpretIosVersions(versions, '1.6.0').live, false);
    assert.deepEqual(interpretIosVersions(versions, '1.5.0'), { found: true, live: true, state: 'READY_FOR_SALE', buildNumber: '6' });
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
    assert.match(path, /^\/apps\/app1\/appStoreVersions/);
    return {
      data: versions.map((v, i) => ({ id: `v${i}`, attributes: { versionString: v.versionString, appStoreState: v.state }, relationships: { build: { data: { id: `b${i}` } } } })),
      included: versions.map((v, i) => ({ type: 'builds', id: `b${i}`, attributes: { version: v.build } })),
    };
  };

  it('reports both live when both stores say so', async () => {
    const play = { getTrack: async () => ({ releases: [{ versionCodes: ['42'], status: 'completed' }] }) };
    const r = await checkStores({ pending, play, ascRequest: fakeAsc([{ versionString: '1.6.0', state: 'READY_FOR_SALE', build: '7' }]), ascAppId: 'app1', ...target });
    assert.deepEqual(r.live, { ios: true, android: true });
    assert.equal(r.detail.iosBuildNumber, '7');
  });

  it('treats missing credentials as not live, and warns', async () => {
    const warnings = [];
    const r = await checkStores({ pending, play: null, ascRequest: null, ascAppId: 'app1', ...target, warn: (m) => warnings.push(m) });
    assert.deepEqual(r.live, { ios: false, android: false });
    assert.equal(warnings.length, 2);
  });

  it('treats an API error as not live, and warns', async () => {
    const warnings = [];
    const failing = async () => { throw new Error('503'); };
    const r = await checkStores({ pending, play: { getTrack: failing }, ascRequest: failing, ascAppId: 'app1', ...target, warn: (m) => warnings.push(m) });
    assert.deepEqual(r.live, { ios: false, android: false });
    assert.equal(warnings.length, 2);
  });

  it('does not ask a store about a platform already announced', async () => {
    const r = await checkStores({ pending: { ...pending, announced: { ios: true, android: true } }, play: null, ascRequest: null, ...target });
    assert.deepEqual(r.live, { ios: true, android: true });
  });
});

describe('pending lifecycle (fake Firestore)', () => {
  const env = 'prod';
  const P = pendingDocPath(env);

  it('goes recorded → one platform → both live → wall + backend dispatched → cleared', async () => {
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

    r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true } });
    assert.equal(r.outcome, 'deploy');
    assert.equal(r.plan.deploySha, 'aaa');
    assert.deepEqual(db.docs.get(CONFIG_DOC).android, { latest: '1.6.0', minSupported: '1.6.0' });
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '1.6.0');
    assert.ok(db.docs.has(P), 'kept until the dispatch is confirmed');

    // A failed dispatch leaves the doc, so the next tick asks for it again.
    r = await applyTick(db, { env, version: '1.6.0', live: { ios: true, android: true } });
    assert.equal(r.plan.deploySha, 'aaa');

    assert.equal((await finishAfterDispatch(db, { env, sha: 'other' })).outcome, 'changed');
    assert.equal((await finishAfterDispatch(db, { env, sha: 'aaa' })).outcome, 'done');
    assert.ok(!db.docs.has(P));
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
});
