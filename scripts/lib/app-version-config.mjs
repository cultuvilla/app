/**
 * Pure payload construction for the `config/appVersion` doc — the force-update
 * gate clients read on launch (`appConfigService` → `resolveVersionGate`).
 *
 * `resolveAppVersionConfig` itself is pure so the resolution rules below stay
 * unit-testable; the only IO is reading the iOS store URL at import.
 */

import { currentStoreUrl } from './app-stores.mjs';

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Pre-release default: never force-block (AGENTS.md "Versioning & releases"). */
export const DEFAULT_MIN_SUPPORTED = '0.0.0';

/**
 * What `latest` becomes for a platform nothing has been announced on. No
 * running client is ever behind `0.0.0`, so `resolveVersionGate` returns 'ok'
 * and that platform is never nudged — the same convention
 * `minSupported: '0.0.0'` already uses to mean "blocks nobody".
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

const PLATFORMS = ['ios', 'android'];

/**
 * The platforms whose installed apps read each env's config/appVersion. Beta's
 * only reader is the Cultuvilla Beta Android app: iOS testers run the
 * production build from TestFlight, which reads prod. A platform nobody serves
 * from an env neither announces there nor caps its wall.
 */
export const SERVED_PLATFORMS = Object.freeze({
  dev: ['ios', 'android'],
  beta: ['android'],
  prod: ['ios', 'android'],
});

/**
 * Where the gate's update button sends each env's users. Beta's Android app is
 * its own Play app (docs/decisions/beta-is-its-own-play-app.md): pointing it at
 * the public listing would offer a tester the wrong app.
 */
export function storeUrlFor(env) {
  if (env === 'beta') {
    return { ...STORE_URL, android: 'https://play.google.com/store/apps/details?id=com.cultuvilla.app.beta' };
  }
  return STORE_URL;
}

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
 * `latest` is PER PLATFORM and the stored value is its source of truth. The
 * announce poller (scripts/release-announce.mjs) moves it the moment that
 * platform's store serves a release — it asks the store — and nothing else
 * should. It used to be derived on every deploy: first from app.config.ts,
 * which announced versions no store had (prod said 1.3.0 while the App Store
 * served 1.2.2, nudging every iOS user towards nothing), then from a
 * hand-edited `APP_STORE_VERSIONS` constant that went stale whenever nobody
 * remembered it. So an omitted `latest` now PRESERVES what is stored.
 * `latestFor` moves single platforms (the poller); `latest` moves both (an
 * out-of-band correction through "Set App Version").
 *
 * `minSupported` is a deliberate decision (raising it walls every older
 * client). Because the doc is written whole (`merge: false`) so its shape stays
 * defined in one place, an omitted `--min` used to silently reset a deliberate
 * wall back to 0.0.0. It defaults to the STORED value instead: omitting it
 * never changes the wall, and only an explicit value moves it.
 */
export function resolveAppVersionConfig({
  latest,
  latestFor: latestByPlatform = {},
  minSupported,
  stored,
  appVersion,
  env,
  storeUrl = storeUrlFor(env),
  servedPlatforms = SERVED_PLATFORMS[env] ?? PLATFORMS,
}) {
  // A blank workflow input arrives as an empty string; treat it as "not given"
  // so it falls through to the preserve path instead of failing.
  const given = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  latest = given(latest);
  minSupported = given(minSupported);

  const latestFor = {};
  const latestSources = {};
  for (const platform of PLATFORMS) {
    const explicit = given(latestByPlatform[platform]) ?? latest;
    const storedLatest = given(stored?.[platform]?.latest);
    const resolved = explicit ?? storedLatest ?? NOT_PUBLISHED;
    if (!SEMVER.test(resolved)) {
      throw new Error(`latest for ${platform} must be MAJOR.MINOR.PATCH, got "${resolved}"`);
    }
    latestFor[platform] = resolved;
    latestSources[platform] = explicit ? 'explicit' : storedLatest ? 'preserved' : 'default';
  }

  const storedMin = stored?.ios?.minSupported ?? stored?.android?.minSupported ?? null;
  const resolvedMin = minSupported ?? storedMin ?? DEFAULT_MIN_SUPPORTED;
  if (!SEMVER.test(resolvedMin)) throw new Error(`minSupported must be MAJOR.MINOR.PATCH, got "${resolvedMin}"`);

  // A wall above what the store serves is the nudge bug with no way off it:
  // every client is blocked and the gate's only button leads to a version that
  // does not exist. `latest` IS what the store serves, so it is the ceiling.
  // Checked for a PRESERVED min too — a wall that arrives by inheritance is more
  // dangerous than one somebody typed, not less. A platform with nothing
  // announced (0.0.0) has no ceiling to breach.
  for (const platform of servedPlatforms) {
    const ceiling = latestFor[platform];
    if (ceiling === NOT_PUBLISHED) continue;
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
    latestSources,
    // Non-empty when the repo is ahead of a store — the normal state between a
    // promotion and that store release going live; worth printing, not an error.
    unreleased: PLATFORMS.filter(
      (p) => appVersion && SEMVER.test(appVersion) && compare(latestFor[p], appVersion) < 0,
    ),
  };
}
