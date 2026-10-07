import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractVersion, currentAppVersion } from '../lib/app-version.mjs';
import { DEFAULT_MIN_SUPPORTED, NOT_PUBLISHED, resolveAppVersionConfig } from '../lib/app-version-config.mjs';
import { currentStoreUrl } from '../lib/app-stores.mjs';

describe('extractVersion', () => {
  it('pulls the top-level version out of an app.config.ts source', () => {
    assert.equal(extractVersion("export default {\n  version: '0.17.0',\n}"), '0.17.0');
    assert.equal(extractVersion('export default {\n  version: "1.2.3",\n}'), '1.2.3');
  });

  it('throws when absent, rather than guessing', () => {
    assert.throws(() => extractVersion('export default {}'), /No `version:` line/);
  });

  it('throws when ambiguous, rather than picking one', () => {
    // Picking the wrong match would silently publish a wrong version.
    const src = "export default {\n  version: '1.0.0',\n}\nexport const other = {\n  version: '2.0.0',\n}";
    assert.throws(() => extractVersion(src), /Ambiguous/);
  });

  it('reads the real app.config.ts', () => {
    assert.match(currentAppVersion(), /^\d+\.\d+\.\d+$/);
  });
});

const doc = (ios, android, min = '0.0.0') => ({
  ios: { latest: ios, minSupported: min },
  android: { latest: android, minSupported: min },
});

describe('resolveAppVersionConfig', () => {
  // What a promotion deploys. Reported, never announced — see the regression
  // block below for why.
  const appVersion = '0.17.0';

  it('prefers an explicit latest, for both platforms', () => {
    const { payload, latestSources } = resolveAppVersionConfig({ latest: '0.18.0', stored: null, appVersion });
    assert.equal(payload.ios.latest, '0.18.0');
    assert.equal(payload.android.latest, '0.18.0');
    assert.deepEqual(latestSources, { ios: 'explicit', android: 'explicit' });
  });

  // The regression this module exists for: the doc is written whole
  // (merge:false), so omitting --min used to reset a deliberate wall to 0.0.0.
  it('PRESERVES a stored minSupported when none is given', () => {
    const { payload, minSource } = resolveAppVersionConfig({ latest: '0.18.0', stored: doc('0.16.0', '0.16.0', '0.15.0'), appVersion });
    assert.equal(payload.ios.minSupported, '0.15.0');
    assert.equal(payload.android.minSupported, '0.15.0');
    assert.equal(minSource, 'preserved');
  });

  it('moves the wall only when minSupported is explicit', () => {
    const { payload, minSource } = resolveAppVersionConfig({ minSupported: '0.16.0', stored: doc('0.16.0', '0.16.0', '0.15.0'), appVersion });
    assert.equal(payload.ios.minSupported, '0.16.0');
    assert.equal(minSource, 'explicit');
  });

  it('falls back to the never-block default when nothing is stored', () => {
    const { payload, minSource } = resolveAppVersionConfig({ stored: null, appVersion });
    assert.equal(payload.ios.minSupported, DEFAULT_MIN_SUPPORTED);
    assert.equal(minSource, 'default');
  });

  it('allows lowering the wall explicitly, including to the default', () => {
    const { payload } = resolveAppVersionConfig({ minSupported: '0.0.0', stored: doc('0.16.0', '0.16.0', '0.15.0'), appVersion });
    assert.equal(payload.ios.minSupported, '0.0.0');
  });

  it('keeps the wall in step across platforms', () => {
    const { payload } = resolveAppVersionConfig({ latest: '0.18.0', minSupported: '0.1.0', stored: null, appVersion });
    assert.deepEqual(payload.ios, payload.android);
  });

  it('always writes both store URLs', () => {
    const { payload } = resolveAppVersionConfig({ stored: null, appVersion });
    assert.ok(payload.storeUrl.ios.startsWith('https://'));
    assert.ok(payload.storeUrl.android.startsWith('https://'));
  });

  // The gate's whole job is to send a walled user somewhere they can update.
  // `startsWith('https://')` above was true of the pre-launch placeholder
  // `https://apps.apple.com/app/id000000000`, which is how a dead link survived
  // into the published 1.x line.
  it('points iOS at the real listing, not a placeholder', () => {
    const { payload } = resolveAppVersionConfig({ stored: null, appVersion });
    assert.equal(payload.storeUrl.ios, currentStoreUrl('ios'));
    assert.doesNotMatch(payload.storeUrl.ios, /id0+$/);
  });

  it('refuses to write a config with no iOS destination at all', () => {
    assert.throws(
      () => resolveAppVersionConfig({ stored: null, appVersion, storeUrl: { ios: '', android: 'https://x' } }),
      /storeUrl.ios/,
    );
  });

  it('rejects a non-semver version', () => {
    for (const bad of ['1.2', 'v1.2.3', '1.2.3-beta', 'latest']) {
      assert.throws(() => resolveAppVersionConfig({ latest: bad, stored: null, appVersion }), /latest for ios must be/);
      assert.throws(() => resolveAppVersionConfig({ latestFor: { android: bad }, stored: null, appVersion }), /latest for android must be/);
      assert.throws(() => resolveAppVersionConfig({ minSupported: bad, stored: null, appVersion }), /minSupported must be/);
    }
  });

  // A garbled stored value must stop the write, not be copied forward as a
  // literal `latest` no client can compare against.
  it('rejects a malformed stored latest rather than preserving it', () => {
    assert.throws(() => resolveAppVersionConfig({ stored: doc('1.2', '1.2.0'), appVersion }), /latest for ios must be/);
  });

  it('treats a blank input as absent, since that is what a blank workflow input sends', () => {
    const { payload, minSource, latestSources } = resolveAppVersionConfig({
      latest: '',
      minSupported: '   ',
      stored: doc('0.16.0', '0.16.0', '0.15.0'),
      appVersion,
    });
    assert.equal(payload.ios.latest, '0.16.0');
    assert.equal(latestSources.ios, 'preserved');
    assert.equal(payload.ios.minSupported, '0.15.0');
    assert.equal(minSource, 'preserved');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `latest` is what the store serves — and only the announce poller knows that.
//
// On 2026-09-22 prod carried ios.latest = 1.3.0 while the App Store served
// 1.2.2: `latest` defaulted to the app.config.ts version a promotion deploys.
// The fix after that, a hand-edited APP_STORE_VERSIONS constant, was right
// until somebody forgot it. Now the deploy preserves `latest`, and the poller
// moves each platform's once its store says the version is live.
// ─────────────────────────────────────────────────────────────────────────────
describe('latest is preserved by a deploy and moved only on purpose', () => {
  it('a deploy (no flags) never announces the version it deploys', () => {
    const { payload, unreleased } = resolveAppVersionConfig({ stored: doc('1.2.2', '1.1.0'), appVersion: '1.3.0' });
    assert.equal(payload.ios.latest, '1.2.2');
    assert.equal(payload.android.latest, '1.1.0');
    assert.deepEqual(unreleased, ['ios', 'android']);
  });

  it('moves one platform at a time — a Play approval must not move iOS', () => {
    const { payload, latestSources } = resolveAppVersionConfig({
      latestFor: { android: '1.3.0' },
      stored: doc('1.2.2', '1.1.0'),
      appVersion: '1.3.0',
    });
    assert.equal(payload.android.latest, '1.3.0');
    assert.equal(payload.ios.latest, '1.2.2');
    assert.deepEqual(latestSources, { ios: 'preserved', android: 'explicit' });
  });

  // Nothing announced reads as "never nudge" through resolveVersionGate,
  // exactly like minSupported 0.0.0 reads as "never block".
  it('never nudges a platform nothing was announced on', () => {
    const { payload } = resolveAppVersionConfig({ stored: null, appVersion: '1.3.0' });
    assert.equal(payload.ios.latest, NOT_PUBLISHED);
    assert.equal(payload.android.latest, NOT_PUBLISHED);
  });

  it('an explicit --latest still wins, for an out-of-band correction', () => {
    const { payload } = resolveAppVersionConfig({ latest: '1.2.2', stored: doc('1.3.0', '1.3.0'), appVersion: '1.3.0' });
    assert.equal(payload.ios.latest, '1.2.2');
  });
});

// A wall above what the store serves is the same broken promise as the nudge,
// except there is no way off it: every client is blocked, and the gate's only
// button leads to a version that does not exist. `latest` is the ceiling.
describe('minSupported cannot exceed what the store serves', () => {
  it('throws rather than walling the fleet behind an unreleased version', () => {
    assert.throws(
      () => resolveAppVersionConfig({ minSupported: '1.3.0', stored: doc('1.2.2', '1.3.0'), appVersion: '1.3.0' }),
      /minSupported 1\.3\.0.*ios.*1\.2\.2/,
    );
  });

  it('allows a wall at exactly the announced version', () => {
    const { payload } = resolveAppVersionConfig({ minSupported: '1.2.2', stored: doc('1.2.2', '1.2.2'), appVersion: '1.3.0' });
    assert.equal(payload.ios.minSupported, '1.2.2');
  });

  it('accepts the poller raising latest and the wall together', () => {
    const { payload } = resolveAppVersionConfig({
      latestFor: { ios: '1.3.0', android: '1.3.0' },
      minSupported: '1.3.0',
      stored: doc('1.2.2', '1.2.2'),
      appVersion: '1.3.0',
    });
    assert.equal(payload.ios.minSupported, '1.3.0');
    assert.equal(payload.android.latest, '1.3.0');
  });

  // Nothing announced on that platform means nothing to compare against.
  it('skips the check for a platform with nothing announced', () => {
    const { payload } = resolveAppVersionConfig({ minSupported: '1.2.0', stored: null, appVersion: '1.3.0' });
    assert.equal(payload.ios.minSupported, '1.2.0');
  });

  // The dangerous direction is a wall that arrives by inheritance rather than
  // by decision: a preserved min must be checked too.
  it('checks a PRESERVED minSupported, not just an explicit one', () => {
    assert.throws(
      () => resolveAppVersionConfig({ latest: '1.2.2', stored: doc('1.3.0', '1.3.0', '1.3.0'), appVersion: '1.3.0' }),
      /minSupported/,
    );
  });
});
