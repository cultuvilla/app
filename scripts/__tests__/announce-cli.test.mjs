// The CLI the workflows call, driven end to end through runCli with a fake
// Firestore and fake stores. What matters most here are the step outputs the
// workflows branch on: `hold_backend` (deploy-firebase.yml) and `deploy_sha`
// (announce-when-live.yml). Losing or inverting either fails silently — a
// breaking backend deployed early, or a held one never dispatched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, parseArgs, parseBoolFlag, runCli } from '../lib/announce-cli.mjs';
import { PLAY_LIFECYCLE, pendingDocPath } from '../lib/announce.mjs';
import { CONFIG_DOC } from '../lib/announce-store.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const P = pendingDocPath('prod');
const NOW = Date.parse('2026-10-10T00:00:00Z');

const config = (ios, android, min = '0.0.0') => ({
  ios: { latest: ios, minSupported: min },
  android: { latest: android, minSupported: min },
  storeUrl: { ios: 'https://apps.apple.com/x', android: 'https://play.google.com/x' },
});

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

const ascOnSale = (version) => async () => ({
  data: [{ id: 'v1', attributes: { versionString: version, appStoreState: 'READY_FOR_SALE' }, relationships: { build: { data: { id: 'b1' } } } }],
  included: [{ type: 'builds', id: 'b1', attributes: { version: '7' } }],
});

/** A context whose world is fully in memory; `outputs` collects $GITHUB_OUTPUT. */
function harness({ db, breaking = false, version = '1.6.0', commitMessage = '', play, asc } = {}) {
  const outputs = {};
  const warnings = [];
  const summaries = [];
  const ctx = {
    db,
    output: (k, v) => { outputs[k] = v; },
    summary: (line) => summaries.push(line),
    log: () => {},
    warn: (m) => warnings.push(m),
    appVersion: () => version,
    rollup: () => (breaking ? { base: 'v1.5.0', commits: 3, breaking: true, reasons: ['drops v1 callable'] } : { base: 'v1.5.0', commits: 3, breaking: false, reasons: [] }),
    headSha: () => 'sha-head',
    playTarget: () => ({ packageName: 'com.cultuvilla.app', track: 'production' }),
    makePlay: () => play ?? null,
    makeAsc: () => asc ?? null,
    ascAppId: 'app1',
    commitMessage,
    now: NOW,
  };
  let made = 0;
  const run = (...argv) => runCli(argv, { makeCtx: () => { made++; return ctx; }, output: ctx.output });
  return { run, outputs, warnings, summaries, made: () => made };
}

describe('parseArgs / parseBoolFlag', () => {
  it('reads bare flags as true and keeps "=" inside values', () => {
    assert.deepEqual(parseArgs(['poll', '--env=prod', '--dry-run', '--x=a=b']), { _: ['poll'], env: 'prod', 'dry-run': true, x: 'a=b' });
  });

  // `--dry-run=true` once fell through to the real-write path.
  it('treats --dry-run and --dry-run=true alike, and refuses anything unrecognized', () => {
    assert.equal(parseBoolFlag(true, 'dry-run'), true);
    assert.equal(parseBoolFlag('true', 'dry-run'), true);
    assert.equal(parseBoolFlag(undefined, 'dry-run'), false);
    assert.equal(parseBoolFlag('false', 'dry-run'), false);
    for (const bad of ['yes', '1', '']) assert.throws(() => parseBoolFlag(bad, 'dry-run'), /--dry-run takes/);
  });
});

describe('runCli', () => {
  // Every `release-announce.mjs <cmd>` a workflow runs must exist here.
  it('registers every subcommand the workflows invoke', () => {
    const dir = path.join(ROOT, '.github/workflows');
    const used = new Set();
    for (const f of readdirSync(dir)) {
      for (const m of readFileSync(path.join(dir, f), 'utf8').matchAll(/release-announce\.mjs ([\w-]+)/g)) used.add(m[1]);
    }
    assert.deepEqual([...used].sort(), ['finish', 'plan', 'poll', 'record', 'record-android']);
    for (const c of used) assert.ok(COMMANDS[c], `${c} not registered`);
  });

  it('touches no credentials off prod, and still answers hold_backend=false', async () => {
    const h = harness({ db: fakeDb() });
    assert.deepEqual(await h.run('plan', '--env=beta'), { skipped: true, env: 'beta' });
    assert.equal(h.made(), 0);
    assert.equal(h.outputs.hold_backend, 'false');
  });

  it('refuses an unknown command', async () => {
    await assert.rejects(harness({ db: fakeDb() }).run('annouce', '--env=prod'), /unknown command/);
  });
});

describe('plan → hold_backend output', () => {
  it('emits true for a breaking release still on its way to the stores', async () => {
    const h = harness({ db: fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') }), breaking: true });
    await h.run('plan', '--env=prod');
    assert.deepEqual(h.outputs, { hold_backend: 'true', in_flight: 'true' });
  });

  it('emits false for a non-breaking release', async () => {
    const h = harness({ db: fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') }) });
    await h.run('plan', '--env=prod');
    assert.equal(h.outputs.hold_backend, 'false');
  });

  it('emits false under [auto-deploy]', async () => {
    const h = harness({ db: fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') }), breaking: true, commitMessage: 'Merge 1.6.0 [auto-deploy]' });
    await h.run('plan', '--env=prod');
    assert.equal(h.outputs.hold_backend, 'false');
  });
});

describe('record', () => {
  // The plan step's verdict is what the deploy did; a re-decision could differ.
  it('records the --hold it is given, not a fresh decision', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') });
    await harness({ db, breaking: false }).run('record', '--env=prod', '--hold=true');
    assert.equal(db.docs.get(P).holdBackend, true);
    assert.equal(db.docs.get(P).backendSha, 'sha-head');
  });

  it('fails the deploy on a --hold it cannot read', async () => {
    await assert.rejects(harness({ db: fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') }) }).run('record', '--env=prod', '--hold='), /--hold must be/);
  });

  it('round-trips plan → record through the output', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0') });
    const h = harness({ db, breaking: true });
    await h.run('plan', '--env=prod');
    await h.run('record', '--env=prod', `--hold=${h.outputs.hold_backend}`);
    assert.equal(db.docs.get(P).holdBackend, true);
  });
});

describe('poll → deploy_sha output', () => {
  const heldPending = {
    version: '1.6.0',
    breaking: true,
    reasons: ['drops v1 callable'],
    holdBackend: true,
    releaseSha: 'sha-rel',
    backendSha: 'sha-rel',
    androidVersionCode: '42',
    announced: { ios: false, android: false },
    recordedAt: new Date(NOW - 86_400_000).toISOString(),
  };
  const playIn = (state) => ({
    listReleases: async () => ({ releases: [{ releaseName: '1.6.0', activeArtifacts: [{ versionCode: '42' }], releaseLifecycleState: state }] }),
    getTrack: async () => ({ releases: [{ versionCodes: ['42'], status: 'completed' }] }),
  });
  const play = playIn(PLAY_LIFECYCLE.PUBLISHED);

  it('emits the held backend once both stores serve it, after writing the wall', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: heldPending });
    const h = harness({ db, play, asc: ascOnSale('1.6.0') });
    await h.run('poll', '--env=prod');
    assert.equal(h.outputs.deploy_sha, 'sha-rel');
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '1.6.0');
    assert.ok(db.docs.has(P), 'left for the deploy to finish');
  });

  it('announces nothing while Play still reviews the release', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: heldPending });
    const h = harness({ db, play: playIn(PLAY_LIFECYCLE.IN_REVIEW), asc: ascOnSale('1.6.0') });
    await h.run('poll', '--env=prod');
    assert.equal(h.outputs.deploy_sha, undefined);
    assert.equal(db.docs.get(CONFIG_DOC).android.latest, '1.5.0');
    assert.equal(db.docs.get(CONFIG_DOC).ios.latest, '1.6.0', 'iOS does not wait for Play');
    assert.deepEqual(h.warnings, []);
  });

  it('puts a Play rejection in the run summary and warns', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: heldPending });
    const h = harness({ db, play: playIn(PLAY_LIFECYCLE.NOT_APPROVED), asc: ascOnSale('1.6.0') });
    await h.run('poll', '--env=prod');
    assert.equal(h.outputs.deploy_sha, undefined);
    assert.equal(db.docs.get(CONFIG_DOC).android.latest, '1.5.0');
    assert.ok(h.summaries.some((l) => /Google Play rejected v1\.6\.0/.test(l)));
    assert.ok(h.warnings.some((w) => /REJECTED/.test(w)));
  });

  it('emits nothing while a store is not live', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: heldPending });
    const h = harness({ db, play, asc: ascOnSale('1.5.0') });
    await h.run('poll', '--env=prod');
    assert.equal(h.outputs.deploy_sha, undefined);
    assert.equal(db.docs.get(CONFIG_DOC).ios.minSupported, '0.0.0');
  });

  for (const flag of ['--dry-run', '--dry-run=true']) {
    it(`${flag} writes nothing and dispatches nothing`, async () => {
      const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: heldPending });
      const h = harness({ db, play, asc: ascOnSale('1.6.0') });
      await h.run('poll', '--env=prod', flag);
      assert.equal(h.outputs.deploy_sha, undefined);
      assert.deepEqual(db.docs.get(CONFIG_DOC), config('1.5.0', '1.5.0'));
    });
  }

  it('refuses an unrecognized --dry-run value before touching anything', async () => {
    const db = fakeDb({ [CONFIG_DOC]: config('1.5.0', '1.5.0'), [P]: heldPending });
    await assert.rejects(harness({ db, play, asc: ascOnSale('1.6.0') }).run('poll', '--env=prod', '--dry-run=yes'), /--dry-run takes/);
    assert.deepEqual(db.docs.get(CONFIG_DOC), config('1.5.0', '1.5.0'));
  });

  it('is quiet with nothing pending', async () => {
    const h = harness({ db: fakeDb() });
    await h.run('poll', '--env=prod');
    assert.deepEqual(h.outputs, {});
  });
});

describe('finish', () => {
  it('clears a held release once its deploy succeeded', async () => {
    const db = fakeDb({ [P]: { version: '1.6.0', holdBackend: true, backendSha: 'sha-rel', announced: { ios: true, android: true } } });
    await harness({ db }).run('finish', '--env=prod', '--sha=sha-rel');
    assert.ok(!db.docs.has(P));
  });

  it('needs --sha', async () => {
    await assert.rejects(harness({ db: fakeDb() }).run('finish', '--env=prod'), /finish needs --sha/);
  });
});
