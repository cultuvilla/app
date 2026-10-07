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
 *      moves to it. Once BOTH do, a breaking release raises `minSupported` —
 *      `planTick`.
 *
 * A breaking release is released by a person, not by the stores: iOS is
 * submitted with a manual release and Play holds it under managed publishing,
 * so an approval publishes nothing. Once BOTH stores have approved, the poller
 * says so (`ready`), and `pnpm release:publish` ships the held backend and
 * releases iOS while the user presses Publish in the Play Console. Should both
 * stores go live without it, the poller still dispatches the held backend.
 *
 * No IO here; every network answer is passed in. See
 * docs/decisions/announce-when-live-poller.md.
 */

import { compareVersions } from './breaking-rollup.mjs';
import { SERVED_PLATFORMS } from './app-version-config.mjs';

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

/**
 * App Store states past App Review: waiting for the manual release, being
 * processed after it, or live.
 */
export const IOS_APPROVED_STATES = new Set([
  ...IOS_LIVE_STATES,
  'PENDING_DEVELOPER_RELEASE',
  'PROCESSING_FOR_DISTRIBUTION',
]);

/**
 * Play's release lifecycle (applications.tracks.releases.list) — the one API
 * that exposes Google's review. Only PUBLISHED means users on the track can
 * install the release, and it also covers a partial or halted rollout, which is
 * why Android liveness additionally needs the edits API's full-rollout check
 * (`interpretPlayTrack`).
 */
export const PLAY_LIFECYCLE = Object.freeze({
  DRAFT: 'RELEASE_LIFECYCLE_STATE_DRAFT',
  NOT_SENT_FOR_REVIEW: 'RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW',
  IN_REVIEW: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW',
  APPROVED_NOT_PUBLISHED: 'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED',
  NOT_APPROVED: 'RELEASE_LIFECYCLE_STATE_NOT_APPROVED',
  PUBLISHED: 'RELEASE_LIFECYCLE_STATE_PUBLISHED',
});
const KNOWN_PLAY_LIFECYCLE = new Set(Object.values(PLAY_LIFECYCLE));

/** A held backend whose dispatched deploy has not cleared the pending doc is retried after this. */
export const DEPLOY_RETRY_HOURS = 6;

/**
 * The `--hold` flag the deploy hands from its plan step to its record step.
 * Strict on purpose: reading anything but `true` as "not held" would record a
 * held release as unheld, and its backend would then never be dispatched —
 * silently. An unexpected value fails the deploy instead.
 */
export function parseHoldFlag(value) {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  throw new Error(`--hold must be "true" or "false", got ${JSON.stringify(value)}`);
}

/** The eas.json submit profile each env's Android builds go out with. */
export const SUBMIT_PROFILE = Object.freeze({ prod: 'production', beta: 'beta' });

/** Where an env's Android builds land, from eas.json — the one place that says. */
export function playTargetFrom(easJson, env = 'prod') {
  const profile = SUBMIT_PROFILE[env];
  const android = easJson?.submit?.[profile]?.android ?? {};
  if (!android.applicationId || !android.track) {
    throw new Error(`eas.json submit.${profile}.android needs applicationId and track`);
  }
  return { packageName: android.applicationId, track: android.track };
}

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
export function announcedVersion(config, platforms = PLATFORMS) {
  const values = platforms.map((p) => config?.[p]?.latest);
  if (!values.every((v) => typeof v === 'string' && SEMVER.test(v))) return null;
  return values.reduce((a, b) => (compareVersions(a, b) <= 0 ? a : b));
}

/** The platforms an env announces on: those whose apps read its config. */
export const platformsFor = (env) => SERVED_PLATFORMS[env] ?? PLATFORMS;

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
  const announced = announcedVersion(config, platformsFor(env));
  // Beta is announced and walled like prod, but always automatically: it is
  // the testers' backend, and they update on the poller's prompt.
  if (env !== 'prod') {
    const inFlight = !announced || compareVersions(version, announced) > 0;
    const reasons = [...new Set(rollup?.reasons ?? [])];
    return { hold: false, inFlight, breaking: reasons.length > 0, reasons, announced, autoDeploy: false, why: `${env}: never held` };
  }

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
export function nextPending(existing, { version, sha, breaking, reasons, hold, now, platforms = PLATFORMS }) {
  const carried = existing?.breaking ? existing.reasons ?? [] : [];
  if (existing && existing.version === version) {
    return {
      ...existing,
      backendSha: sha,
      breaking: Boolean(existing.breaking || breaking),
      reasons: [...new Set([...(existing.reasons ?? []), ...(reasons ?? [])])],
      holdBackend: hold,
      platforms: existing.platforms ?? platforms,
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
    platforms,
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
 *   deploySha   the held backend to dispatch now, or null (also null while a
 *               dispatched deploy is still within DEPLOY_RETRY_HOURS)
 *   clear       delete the pending doc (live everywhere, no backend held). A
 *               held release is cleared by its own deploy, on success only.
 *   waitingOn   platforms still not live
 *   ready       a held release both stores have approved: time for
 *               `pnpm release:publish` (first tick only)
 *   publishedEarly  platforms a held release went live on before the other
 *               store approved it (first tick only)
 *   stuckUnpublished  an unheld release Play approved but did not publish:
 *               managed publishing is still on
 *
 * `approved` and `awaitingPublish` are per platform, from the store checks.
 */
export function planTick(pending, { live, approved = {}, awaitingPublish = {}, stored, now = Date.now() }) {
  const version = pending.version;
  // Beta announces Android alone; a doc recorded before `platforms` existed is prod's pair.
  const platforms = pending.platforms ?? PLATFORMS;
  const before = pending.announced ?? { ios: false, android: false };
  const newlyLive = platforms.filter((p) => live?.[p] && !before[p]);
  const announced = Object.fromEntries(PLATFORMS.map((p) => [p, Boolean(before[p] || (platforms.includes(p) && live?.[p]))]));
  const bothLive = platforms.every((p) => announced[p]);

  const latestFor = {};
  for (const p of newlyLive) latestFor[p] = maxVersion(stored?.[p]?.latest, version);

  let minSupported;
  if (bothLive && pending.breaking) {
    const storedMin = stored?.ios?.minSupported ?? stored?.android?.minSupported;
    minSupported = maxVersion(storedMin, version);
  }

  const writes = Object.keys(latestFor).length > 0 || minSupported !== undefined;

  // The held deploy clears the pending doc itself when it succeeds. Until then
  // the doc stays, and a dispatch that has not cleared it in DEPLOY_RETRY_HOURS
  // (rejected, or failed a gate) is dispatched again rather than forgotten.
  const requestedAt = Date.parse(pending.deployRequestedAt ?? '');
  const awaitingDeploy = Number.isFinite(requestedAt) && now - requestedAt < DEPLOY_RETRY_HOURS * 3_600_000;
  const held = bothLive && Boolean(pending.holdBackend);
  const deploySha = held && !awaitingDeploy ? pending.backendSha ?? pending.releaseSha ?? null : null;

  // A held release waits for a person once both stores approve it. Said once.
  const isApproved = (p) => Boolean(announced[p] || live?.[p] || approved?.[p]);
  const bothApproved = platforms.every(isApproved);
  const ready = Boolean(pending.holdBackend) && bothApproved && !bothLive && !pending.readyNotifiedAt;

  // A held release live on one store while the other has not approved it: the
  // store published on approval (Play managed publishing was off), and its
  // users now run the new binary against the old backend. Said once.
  const publishedEarly = Boolean(pending.holdBackend) && !pending.earlyAlertedAt
    ? platforms.filter((p) => live?.[p] && platforms.some((q) => q !== p && !isApproved(q)))
    : [];

  // An unheld release approved by Play but not published: managed publishing
  // was left on after a breaking release, and nothing goes out until a person
  // presses Publish. Said every tick — it does not fix itself.
  const stuckUnpublished = !pending.holdBackend && Boolean(awaitingPublish?.android);

  return {
    config: writes ? { latestFor, minSupported } : null,
    announced,
    newlyLive,
    ready,
    publishedEarly,
    stuckUnpublished,
    deploySha,
    retry: Boolean(deploySha && Number.isFinite(requestedAt)),
    awaitingDeploy: held && awaitingDeploy,
    clear: bothLive && !pending.holdBackend,
    waitingOn: platforms.filter((p) => !announced[p]),
  };
}

/** Days since the release was recorded, for the stuck-in-review warning. */
export function ageInDays(pending, now = Date.now()) {
  const at = Date.parse(pending?.recordedAt ?? '');
  return Number.isFinite(at) ? (now - at) / 86_400_000 : 0;
}

// ── store answers ─────────────────────────────────────────────────────────

const hasCode = (versionCode) => versionCode != null && versionCode !== '';

/** Matches `version` inside a release name, but not inside a longer one (1.5.0 vs 1.5.01). */
const versionNameRe = (version) => new RegExp(`(^|[^\\d.])${String(version).replace(/\./g, '\\.')}([^\\d.]|$)`);

/**
 * Where is `version`'s release in Play's lifecycle? `list` is the
 * applications.tracks.releases.list response for the production track.
 *
 * Matched by the versionCode recorded after the build when there is one. Without
 * it (the record step failed, or the release shipped by hand) the release NAME
 * is the fallback: Play names a release after the bundle's versionName unless
 * the uploader sets one, and EAS does not. A recorded code that matches nothing
 * is "not found", never a name match: that could be another build of the same
 * version.
 *
 *   published  users on the track can install it (full rollout still to check)
 *   rejected   NOT_APPROVED — a human has to look
 *   known      a state this code understands; an unknown one reads as not live
 */
export function interpretPlayLifecycle(list, { versionCode, version }) {
  const releases = list?.releases ?? [];
  const via = hasCode(versionCode) ? 'versionCode' : 'name';
  const rel = via === 'versionCode'
    ? releases.find((r) => (r.activeArtifacts ?? []).some((a) => String(a?.versionCode) === String(versionCode)))
    : releases.find((r) => versionNameRe(version).test(String(r.releaseName ?? '')));
  if (!rel) {
    return { found: false, published: false, approved: false, awaitingPublish: false, rejected: false, known: true, state: null, versionCodes: [], via };
  }
  const state = rel.releaseLifecycleState ?? null;
  return {
    found: true,
    published: state === PLAY_LIFECYCLE.PUBLISHED,
    approved: state === PLAY_LIFECYCLE.PUBLISHED || state === PLAY_LIFECYCLE.APPROVED_NOT_PUBLISHED,
    awaitingPublish: state === PLAY_LIFECYCLE.APPROVED_NOT_PUBLISHED,
    rejected: state === PLAY_LIFECYCLE.NOT_APPROVED,
    known: KNOWN_PLAY_LIFECYCLE.has(state),
    state,
    releaseName: rel.releaseName ?? null,
    versionCodes: (rel.activeArtifacts ?? []).filter((a) => hasCode(a?.versionCode)).map((a) => String(a.versionCode)),
    via,
  };
}

/** `RELEASE_LIFECYCLE_STATE_IN_REVIEW` → `IN_REVIEW`, for logs. */
export const shortPlayState = (state) => String(state ?? 'UNKNOWN').replace(/^RELEASE_LIFECYCLE_STATE_/, '');

/**
 * Is the release fully rolled out on a Play track — the edits API's view?
 * Matched like `interpretPlayLifecycle`: by versionCode when there is one, else
 * by name.
 *
 * Full rollout means `completed`. Play drops `userFraction` once a staged
 * rollout reaches 100%, so an absent fraction on a completed release is full;
 * `inProgress` (staged), `halted` and `draft` are not. On its own this does NOT
 * prove the release is downloadable: eas.json submits with `releaseStatus:
 * completed`, so the track reads `completed` while Google's review is still
 * running. The lifecycle's PUBLISHED proves that; this adds "to everyone".
 */
export function interpretPlayTrack(track, { versionCode, version }) {
  const releases = track?.releases ?? [];
  const via = hasCode(versionCode) ? 'versionCode' : 'name';
  const rel = via === 'versionCode'
    ? releases.find((r) => (r.versionCodes ?? []).map(String).includes(String(versionCode)))
    : releases.find((r) => versionNameRe(version).test(String(r.name ?? '')));
  if (!rel) return { found: false, fullRollout: false, status: null, via };
  const fraction = rel.userFraction ?? 1;
  return {
    found: true,
    fullRollout: rel.status === 'completed' && fraction >= 1,
    status: rel.status ?? null,
    userFraction: fraction,
    versionCodes: rel.versionCodes ?? [],
    via,
  };
}

/**
 * Android is live iff Play's lifecycle says PUBLISHED and the edits API shows
 * that release at full rollout. `lifecycle` is `interpretPlayLifecycle`'s
 * answer; `rollout` is `interpretPlayTrack`'s, or null when it was not asked
 * (it is only worth asking once the release is published).
 *
 * Returns `{ live, rejected, unknown, detail }`; `rejected` and `unknown` are
 * for the caller to shout about, since neither fixes itself.
 */
export function decideAndroidLive({ lifecycle, rollout, track = 'production' }) {
  if (!lifecycle.found) {
    return { live: false, rejected: false, unknown: false, detail: `not on the ${track} track yet (looked up by ${lifecycle.via})` };
  }
  const state = shortPlayState(lifecycle.state);
  if (lifecycle.rejected) {
    return { live: false, rejected: true, unknown: false, detail: `${track} release ${state} — Google rejected it` };
  }
  if (!lifecycle.known) {
    return { live: false, rejected: false, unknown: true, detail: `${track} release in an unknown lifecycle state ${state}` };
  }
  if (!lifecycle.published) {
    const detail = lifecycle.awaitingPublish
      ? `${track} release approved, waiting for Publish in the Play Console (managed publishing)`
      : `${track} release ${state} — not published yet`;
    return { live: false, rejected: false, unknown: false, detail };
  }
  if (!rollout?.found) {
    return { live: false, rejected: false, unknown: true, detail: `${track} release PUBLISHED, but not found on the edits track` };
  }
  return {
    live: rollout.fullRollout,
    rejected: false,
    unknown: false,
    detail: `${track} release PUBLISHED, ${rollout.status} at ${Math.round(rollout.userFraction * 100)}% (matched by ${lifecycle.via})`,
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
  if (!v) return { found: false, live: false, approved: false, state: null, buildNumber: null };
  return {
    found: true,
    live: IOS_LIVE_STATES.has(v.appStoreState),
    approved: IOS_APPROVED_STATES.has(v.appStoreState),
    state: v.appStoreState ?? null,
    buildNumber: v.buildNumber ?? null,
  };
}
