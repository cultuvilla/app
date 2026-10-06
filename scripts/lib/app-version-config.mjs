/**
 * Pure payload construction for the `config/appVersion` doc — the force-update
 * gate clients read on launch (`appConfigService` → `resolveVersionGate`).
 *
 * `resolveAppVersionConfig` itself is pure so the resolution rules below stay
 * unit-testable; the only IO is reading the app's own store facts at import.
 */

import { currentStoreUrl, currentStoreVersion } from './app-stores.mjs';

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Pre-release default: never force-block (AGENTS.md "Versioning & releases"). */
export const DEFAULT_MIN_SUPPORTED = '0.0.0';

/**
 * What `latest` becomes for a platform with nothing published. No running
 * client is ever behind `0.0.0`, so `resolveVersionGate` returns 'ok' and that
 * platform is never nudged — the same convention `minSupported: '0.0.0'`
 * already uses to mean "blocks nobody".
 */
export const NOT_PUBLISHED = '0.0.0';

/**
 * Where a walled client is sent to update. The same across envs — one published
 * app per store.
 *
 * iOS is READ from `packages/shared/src/config/appStores.ts` rather than restated here. A
 * second copy is exactly how the pre-launch placeholder `id000000000` survived
 * into the published 1.x line: every force-updated user would have been sent to
 * a dead App Store page.
 *
 * Android is deliberately NOT read from there. `APP_STORES.android` gates what
 * the *web build advertises* and stays empty until the Play listing is public,
 * but a walled tester already has access to that listing and still needs
 * somewhere to get the update.
 */
export const STORE_URL = {
  ios: currentStoreUrl('ios'),
  android: 'https://play.google.com/store/apps/details?id=com.cultuvilla.app',
};

/**
 * What each store actually serves, from the same single source as the URLs.
 * This — not the repo's own version — is what `latest` may promise.
 */
export const PUBLISHED_VERSION = {
  ios: currentStoreVersion('ios'),
  android: currentStoreVersion('android'),
};

const PLATFORMS = ['ios', 'android'];

/** -1 / 0 / 1 for two validated `MAJOR.MINOR.PATCH` strings. */
function compare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Resolve what to write, given the requested values and whatever is already
 * stored.
 *
 * `latest` is PER PLATFORM and comes from `APP_STORE_VERSIONS`, not from
 * `app.config.ts`. The repo's version is what a promotion deploys to the
 * backend and the web; a store binary moves only by an explicit
 * `mobile-release` dispatch and then waits for review, so the two drift by
 * design. Announcing the repo's version made the gate promise a download that
 * did not exist: on 2026-09-22 prod said 1.3.0 while the App Store served
 * 1.2.2, so every iOS user already on the newest build there was nudged every
 * three days towards nothing. `appVersion` is now reported, never announced.
 *
 * `minSupported` is a deliberate product decision (raising it walls every older
 * client), while `latest` changes on every release. Because the doc is written
 * whole (`merge: false`) so its shape stays defined in one place, an omitted
 * `--min` used to silently reset a deliberate wall back to 0.0.0. It now
 * defaults to the STORED value instead: omitting it never changes the wall, and
 * only an explicit `--min` moves it.
 */
export function resolveAppVersionConfig({
  latest,
  minSupported,
  stored,
  appVersion,
  storeUrl = STORE_URL,
  published = PUBLISHED_VERSION,
}) {
  // A blank workflow input arrives as an empty string; treat it as "not given"
  // so it falls through to the default/preserve path instead of failing.
  const given = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  latest = given(latest);
  minSupported = given(minSupported);

  const latestFor = {};
  for (const platform of PLATFORMS) {
    const resolved = latest ?? given(published[platform]) ?? NOT_PUBLISHED;
    if (!SEMVER.test(resolved)) {
      throw new Error(`latest for ${platform} must be MAJOR.MINOR.PATCH, got "${resolved}"`);
    }
    latestFor[platform] = resolved;
  }

  const storedMin = stored?.ios?.minSupported ?? stored?.android?.minSupported ?? null;
  const resolvedMin = minSupported ?? storedMin ?? DEFAULT_MIN_SUPPORTED;
  if (!SEMVER.test(resolvedMin)) throw new Error(`minSupported must be MAJOR.MINOR.PATCH, got "${resolvedMin}"`);

  // A wall above what the store serves is the nudge bug with no way off it:
  // every client is blocked and the gate's only button leads to a version that
  // does not exist. Checked for a PRESERVED min too — a wall that arrives by
  // inheritance is more dangerous than one somebody typed, not less. A platform
  // with nothing published has no ceiling to breach.
  for (const platform of PLATFORMS) {
    const ceiling = given(published[platform]);
    if (!ceiling || !SEMVER.test(ceiling)) continue;
    if (compare(resolvedMin, ceiling) > 0) {
      throw new Error(
        `minSupported ${resolvedMin} is above what ${platform} serves (${ceiling}) — ` +
          `every client would be blocked with nowhere to update. Publish that version first.`,
      );
    }
  }

  // A blank URL would leave the gate's only button inert, walling the fleet
  // with no way off. Fail the write instead of shipping that.
  for (const key of PLATFORMS) {
    if (!storeUrl[key]) throw new Error(`storeUrl.${key} is empty — the force-update gate would have nowhere to send anyone`);
  }

  return {
    payload: {
      ios: { minSupported: resolvedMin, latest: latestFor.ios },
      android: { minSupported: resolvedMin, latest: latestFor.android },
      storeUrl,
    },
    minSource: minSupported ? 'explicit' : storedMin ? 'preserved' : 'default',
    latestSource: latest ? 'explicit' : 'published store version',
    // Non-empty when the repo is ahead of every store — the normal state
    // between a promotion and a store release, worth printing but not an error.
    unreleased: PLATFORMS.filter(
      (p) => appVersion && SEMVER.test(appVersion) && compare(latestFor[p], appVersion) < 0,
    ),
  };
}
