/**
 * Announce-when-live: the pure decisions behind scripts/release-announce.mjs.
 *
 * A production release crosses three moments, and this module decides each:
 *
 *   1. DEPLOY (push to main, deploy-firebase.yml). Is the backend held? A
 *      breaking release keeps its functions and rules back until the stores
 *      serve the binary that copes with them — `decideBackendHold`.
 *   2. RECORD (end of that deploy). The release is written to
 *      `_admin/announce/pending/{env}` for the poller — `nextPending`.
 *   3. ANNOUNCE (announce-when-live.yml, every 30 min). Per platform, the
 *      moment its store serves the version, `config/appVersion.<platform>.latest`
 *      moves to it. Once BOTH do, a breaking release raises `minSupported` and
 *      the held backend is dispatched — `planTick`.
 *
 * No IO here; every network answer is passed in. See
 * docs/decisions/announce-when-live-poller.md.
 */

import { compareVersions } from './breaking-rollup.mjs';

export const PLATFORMS = ['ios', 'android'];

/**
 * Where the pending release lives. Four segments — `_admin` / `announce` /
 * `pending` / `{env}` — because a Firestore document path needs an even count;
 * `_admin/announce/{env}` would be a collection and `db.doc()` throws on it.
 * `_admin/**` is closed to every client in firestore.rules.
 */
export const pendingDocPath = (env) => `_admin/announce/pending/${env}`;

/** Old enough that a human should look: the build is probably stuck in review. */
export const STALE_DAYS = 7;

/** App Store states in which anyone can download the version. */
export const IOS_LIVE_STATES = new Set(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION']);

const SEMVER = /^\d+\.\d+\.\d+$/;

const maxVersion = (a, b) => {
  if (!a || !SEMVER.test(a)) return b;
  if (!b || !SEMVER.test(b)) return a;
  return compareVersions(a, b) >= 0 ? a : b;
};

/**
 * The newest version BOTH stores are known to serve — the lower of the two
 * announced `latest` values. Anything above it is still in flight: some
 * platform's users cannot download it yet. `null` when the doc is absent or
 * malformed, which reads as "nothing announced", so every version is in flight.
 */
export function announcedVersion(config) {
  const values = PLATFORMS.map((p) => config?.[p]?.latest);
  if (!values.every((v) => typeof v === 'string' && SEMVER.test(v))) return null;
  return compareVersions(values[0], values[1]) <= 0 ? values[0] : values[1];
}

/**
 * Hold this deploy's functions and rules?
 *
 * A breaking backend must not reach users before the wall can: until the stores
 * serve the new binary, `minSupported` cannot be raised (nothing to update to),
 * so an installed client the backend no longer supports would simply break,
 * with no screen telling it why. Holding moves the breaking backend to the
 * moment the poller raises the wall.
 *
 *  - prod only. Beta is the testers' backend and always deploys immediately.
 *  - breaking: a `Breaking-Client:` trailer since the previous release tag, OR
 *    a still-pending held release (sticky — a later non-breaking push would
 *    otherwise deploy the earlier release's breaking commits, since it contains
 *    them, and its own rollup range does not).
 *  - in flight: this version is above what both stores are known to serve. A
 *    breaking change with nothing in flight has no binary to wait for — holding
 *    it would hold it forever — so it deploys, and says so loudly.
 *  - `[auto-deploy]` in the merge commit overrides the hold.
 */
export function decideBackendHold({ env, version, config, rollup, pending, commitMessage = '' }) {
  if (env !== 'prod') return { hold: false, inFlight: false, breaking: false, reasons: [], why: `${env}: never held` };

  const announced = announcedVersion(config);
  const inFlight = !announced || compareVersions(version, announced) > 0;
  const sticky = Boolean(pending?.holdBackend);
  const reasons = [...new Set([...(rollup?.reasons ?? []), ...(sticky ? (pending.reasons ?? []) : [])])];
  const breaking = Boolean(rollup?.breaking) || sticky;
  const autoDeploy = /\[auto-deploy\]/i.test(commitMessage ?? '');

  let hold = false;
  let why;
  if (!breaking) why = 'not breaking';
  else if (!inFlight) {
    why = `breaking, but ${version} is not ahead of what both stores serve (${announced}) — nothing to wait for, deploying`;
  } else if (autoDeploy) why = 'breaking, but [auto-deploy] in the merge commit';
  else {
    hold = true;
    why = sticky && !rollup?.breaking
      ? `pending release ${pending.version} is held and breaking — this push carries its commits`
      : `breaking and ${version} is not live in both stores yet`;
  }
  return { hold, inFlight, breaking, reasons, announced, autoDeploy, why };
}

/**
 * The pending doc after recording a deploy of `version` at `sha`.
 *
 * Same version as the stored doc (a re-run, or a hotfix merge without a bump):
 * keep what the poller already learned (announced platforms, build numbers) and
 * move `backendSha` — the commit a held deploy will ship — to this push.
 *
 * A new version supersedes the stored doc. An unannounced breaking release
 * hands its breaking flag on: the wall it never raised is raised by the release
 * that replaces it.
 */
export function nextPending(existing, { version, sha, breaking, reasons, hold, now }) {
  const carried = existing?.breaking ? existing.reasons ?? [] : [];
  if (existing && existing.version === version) {
    return {
      ...existing,
      backendSha: sha,
      breaking: Boolean(existing.breaking || breaking),
      reasons: [...new Set([...(existing.reasons ?? []), ...(reasons ?? [])])],
      holdBackend: hold,
      updatedAt: now,
    };
  }
  return {
    version,
    releaseSha: sha,
    backendSha: sha,
    breaking: Boolean(breaking || existing?.breaking),
    reasons: [...new Set([...carried, ...(reasons ?? [])])],
    holdBackend: hold,
    androidVersionCode: null,
    iosBuildNumber: null,
    announced: { ios: false, android: false },
    supersedes: existing?.version ?? null,
    recordedAt: now,
    updatedAt: now,
  };
}

/**
 * One poller tick, given which stores serve the pending version right now.
 *
 * Each platform is announced on its own, the first tick its store serves the
 * version: an iOS approval does not wait for Play. `latest` only ever moves up.
 *
 * The wall and the held backend wait for BOTH. `minSupported` is one value for
 * the fleet, and raising it while one store cannot serve the version would
 * block that platform with nowhere to go. The wall is written in the same tick
 * as the deploy is dispatched, and before it: a wall without its backend is
 * safe (old clients are told to update), a backend without its wall is not.
 *
 * Returns:
 *   config      { latestFor, minSupported } to write to config/appVersion, or null
 *   announced   the pending doc's next `announced`
 *   deploySha   the held backend to dispatch now, or null
 *   clear       delete the pending doc (done, nothing left to dispatch)
 *   waitingOn   platforms still not live
 */
export function planTick(pending, { live, stored }) {
  const version = pending.version;
  const before = pending.announced ?? { ios: false, android: false };
  const newlyLive = PLATFORMS.filter((p) => live?.[p] && !before[p]);
  const announced = Object.fromEntries(PLATFORMS.map((p) => [p, Boolean(before[p] || live?.[p])]));
  const bothLive = PLATFORMS.every((p) => announced[p]);

  const latestFor = {};
  for (const p of newlyLive) latestFor[p] = maxVersion(stored?.[p]?.latest, version);

  let minSupported;
  if (bothLive && pending.breaking) {
    const storedMin = stored?.ios?.minSupported ?? stored?.android?.minSupported;
    minSupported = maxVersion(storedMin, version);
  }

  const writes = Object.keys(latestFor).length > 0 || minSupported !== undefined;
  const deploySha = bothLive && pending.holdBackend ? pending.backendSha ?? pending.releaseSha ?? null : null;

  return {
    config: writes ? { latestFor, minSupported } : null,
    announced,
    newlyLive,
    deploySha,
    clear: bothLive && !deploySha,
    waitingOn: PLATFORMS.filter((p) => !announced[p]),
  };
}

/** Days since the release was recorded, for the stuck-in-review warning. */
export function ageInDays(pending, now = Date.now()) {
  const at = Date.parse(pending?.recordedAt ?? '');
  return Number.isFinite(at) ? (now - at) / 86_400_000 : 0;
}

// ── store answers ─────────────────────────────────────────────────────────

/**
 * Is `version` fully live on a Play track?
 *
 * Matched by the versionCode recorded after the build when there is one. Without
 * it (the record step failed, or the release shipped by hand) the release NAME
 * is the fallback: Play names a release after the bundle's versionName unless
 * the uploader sets one, and EAS does not.
 *
 * Live means `completed` at full rollout. Play drops `userFraction` once a
 * staged rollout reaches 100%, so an absent fraction on a completed release is
 * full; `inProgress` (staged), `halted` and `draft` are not live.
 */
export function interpretPlayTrack(track, { versionCode, version }) {
  const releases = track?.releases ?? [];
  const byCode = versionCode != null && versionCode !== ''
    ? releases.find((r) => (r.versionCodes ?? []).map(String).includes(String(versionCode)))
    : null;
  const nameRe = new RegExp(`(^|[^\\d.])${String(version).replace(/\./g, '\\.')}([^\\d.]|$)`);
  const rel = byCode ?? releases.find((r) => nameRe.test(String(r.name ?? '')));
  if (!rel) return { found: false, live: false, status: null, via: versionCode ? 'versionCode' : 'name' };
  const fraction = rel.userFraction ?? 1;
  return {
    found: true,
    live: rel.status === 'completed' && fraction >= 1,
    status: rel.status ?? null,
    userFraction: fraction,
    versionCodes: rel.versionCodes ?? [],
    via: byCode ? 'versionCode' : 'name',
  };
}

/**
 * Is `version` on sale in the App Store? `versions` is listVersions() from
 * scripts/lib/appstore-flows.mjs. Matched by marketing version: there is exactly
 * one App Store version per version string, and the build attached to it is the
 * one App Review approved. A phased release is still live — anyone can download
 * it from the listing; the phase only throttles automatic updates.
 */
export function interpretIosVersions(versions, version) {
  const v = (versions ?? []).find((x) => x?.versionString === version);
  if (!v) return { found: false, live: false, state: null, buildNumber: null };
  return {
    found: true,
    live: IOS_LIVE_STATES.has(v.appStoreState),
    state: v.appStoreState ?? null,
    buildNumber: v.buildNumber ?? null,
  };
}
