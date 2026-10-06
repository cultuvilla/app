/**
 * The Firestore and store-API halves of announce-when-live, kept apart from the
 * CLI so tests drive them with a fake `db`, a fake Play client and a fake ASC.
 * Every decision is delegated to lib/announce.mjs; this file only reads, asks
 * and writes.
 */

import { resolveAppVersionConfig } from './app-version-config.mjs';
import {
  androidSoaked,
  interpretIosVersions,
  interpretPlayTrack,
  nextPending,
  pendingDocPath,
  planTick,
  PLATFORMS,
} from './announce.mjs';

export const CONFIG_DOC = 'config/appVersion';

/**
 * The App Store version with exactly this version string, with its build
 * number. Filtered server-side rather than scanning a page of recent versions:
 * ASC promises no ordering for that list, so a version outside the page would
 * read as "not found" forever and hold a backend indefinitely.
 */
export async function findIosVersion(request, { ascAppId, version }) {
  const data = await request(
    'GET',
    `/apps/${ascAppId}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${encodeURIComponent(version)}&include=build&limit=5`,
  );
  const buildById = new Map(
    (data?.included ?? []).filter((i) => i.type === 'builds').map((b) => [b.id, b.attributes?.version]),
  );
  return (data?.data ?? []).map((v) => {
    const ref = v.relationships?.build?.data;
    return {
      versionString: v.attributes?.versionString ?? null,
      appStoreState: v.attributes?.appStoreState ?? v.attributes?.appVersionState ?? null,
      buildNumber: ref ? (buildById.get(ref.id) ?? null) : null,
    };
  });
}

/**
 * Which stores serve `pending.version` right now. Fails safe in every
 * direction: missing or malformed credentials, an API error or an unknown
 * answer all read as "not live", with a warning, so the next tick simply asks
 * again. A platform already announced is not asked.
 *
 * The clients are built HERE, inside each store's try, from the factories:
 * a corrupt secret throws while the client is constructed, and that must cost
 * one warning, not a red run every 30 minutes.
 *
 * Android also has to soak (see ANDROID_SOAK_HOURS): the first tick that sees
 * the release completed returns `androidCompletedSeenAt` for the caller to
 * keep, and Android counts as live only once that is old enough.
 */
export async function checkStores({
  pending,
  makePlay,
  makeAsc,
  ascAppId,
  packageName,
  track,
  warn = () => {},
  now = Date.now(),
}) {
  const live = { ios: false, android: false };
  const detail = {};

  if (pending.announced?.android) {
    live.android = true;
    detail.android = 'already announced';
  } else {
    try {
      const play = makePlay();
      if (!play) {
        warn('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set — cannot confirm Android is live; treating it as not live.');
        detail.android = 'no Play credentials';
      } else {
        const r = interpretPlayTrack(await play.getTrack(packageName, track), {
          versionCode: pending.androidVersionCode,
          version: pending.version,
        });
        detail.android = r.found
          ? `${track} release ${r.status} at ${Math.round(r.userFraction * 100)}% (matched by ${r.via})`
          : `not on the ${track} track yet (looked up by ${r.via})`;
        if (r.live) {
          const seenAt = pending.androidCompletedSeenAt ?? new Date(now).toISOString();
          detail.androidCompletedSeenAt = seenAt;
          live.android = androidSoaked({ seenAt, now });
          if (!live.android) detail.android += `, soaking since ${seenAt} (Play reports completed before review ends)`;
        }
      }
    } catch (err) {
      warn(`Play check failed (${err.message}) — treating Android as not live.`);
      detail.android = 'Play error';
    }
  }

  if (pending.announced?.ios) {
    live.ios = true;
    detail.ios = 'already announced';
  } else {
    try {
      const ascRequest = makeAsc();
      if (!ascRequest || !ascAppId) {
        warn('App Store Connect credentials or ASC_APP_ID missing — cannot confirm iOS is live; treating it as not live.');
        detail.ios = 'no ASC credentials';
      } else {
        const r = interpretIosVersions(await findIosVersion(ascRequest, { ascAppId, version: pending.version }), pending.version);
        live.ios = r.live;
        detail.ios = r.found ? `${r.state} (build ${r.buildNumber ?? '?'})` : 'no App Store version yet';
        if (r.live && r.buildNumber) detail.iosBuildNumber = String(r.buildNumber);
      }
    } catch (err) {
      warn(`ASC check failed (${err.message}) — treating iOS as not live.`);
      detail.ios = 'ASC error';
    }
  }

  return { live, detail };
}

/**
 * Record a deploy of `version` at `sha`. A version both stores already serve
 * is not in flight and records nothing.
 */
export async function recordRelease(db, { env, version, sha, decision, now = new Date().toISOString() }) {
  if (!decision.inFlight) return { outcome: 'not-in-flight' };
  const ref = db.doc(pendingDocPath(env));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const doc = nextPending(existing, {
      version,
      sha,
      breaking: decision.breaking,
      reasons: decision.reasons,
      hold: decision.hold,
      now,
    });
    tx.set(ref, doc);
    return { outcome: existing?.version === version ? 'updated' : 'recorded', doc };
  });
}

/** Attach the Android versionCode the production build got, if it is still the pending version. */
export async function recordAndroidBuild(db, { env, version, versionCode }) {
  const ref = db.doc(pendingDocPath(env));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { outcome: 'no-pending' };
    const pending = snap.data();
    if (pending.version !== version) return { outcome: 'other-version', pending };
    tx.set(ref, { ...pending, androidVersionCode: String(versionCode), updatedAt: new Date().toISOString() });
    return { outcome: 'recorded' };
  });
}

/**
 * Apply one tick: write what `planTick` decides, in one transaction with the
 * pending doc so a release recorded meanwhile is never announced on the
 * strength of the previous one's store check.
 */
export async function applyTick(
  db,
  { env, version, live, iosBuildNumber, androidCompletedSeenAt, dryRun = false, now = Date.now() },
) {
  const nowIso = new Date(now).toISOString();
  const pendingRef = db.doc(pendingDocPath(env));
  const configRef = db.doc(CONFIG_DOC);
  return db.runTransaction(async (tx) => {
    const pSnap = await tx.get(pendingRef);
    if (!pSnap.exists) return { outcome: 'gone' };
    const pending = pSnap.data();
    if (pending.version !== version) return { outcome: 'superseded', pending };
    const cSnap = await tx.get(configRef);
    const stored = cSnap.exists ? cSnap.data() : null;

    const plan = planTick(pending, { live, stored, now });
    let payload = null;
    if (plan.config) {
      payload = resolveAppVersionConfig({
        latestFor: plan.config.latestFor,
        minSupported: plan.config.minSupported,
        stored,
        appVersion: version,
      }).payload;
    }
    if (dryRun) return { outcome: 'dry-run', plan, payload, pending };

    if (payload) tx.set(configRef, payload, { merge: false });
    if (plan.clear) tx.delete(pendingRef);
    else {
      tx.set(pendingRef, {
        ...pending,
        announced: plan.announced,
        ...(iosBuildNumber ? { iosBuildNumber } : {}),
        ...(androidCompletedSeenAt && !pending.androidCompletedSeenAt ? { androidCompletedSeenAt } : {}),
        ...(plan.deploySha ? { deployRequestedAt: nowIso } : {}),
        updatedAt: nowIso,
      });
    }
    const outcome = plan.clear ? 'done' : plan.deploySha ? 'deploy' : plan.awaitingDeploy ? 'awaiting-deploy' : 'waiting';
    return { outcome, plan, payload, pending };
  });
}

/**
 * A held backend deployed successfully at `sha` — called by that deploy run
 * itself, never on mere dispatch, so a deploy that fails a gate leaves the
 * pending doc for the poller to retry. Bound to the SHA so a newer release
 * recorded in between is left alone. A backend released early by hand (before
 * both stores serve the release) keeps the doc, unheld, for the announce.
 */
export async function finishHeldDeploy(db, { env, sha, now = new Date().toISOString() }) {
  const ref = db.doc(pendingDocPath(env));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { outcome: 'gone' };
    const pending = snap.data();
    if ((pending.backendSha ?? pending.releaseSha) !== sha) return { outcome: 'other-sha', pending };
    if (PLATFORMS.every((p) => pending.announced?.[p])) {
      tx.delete(ref);
      return { outcome: 'done' };
    }
    tx.set(ref, { ...pending, holdBackend: false, backendDeployedAt: now, updatedAt: now });
    return { outcome: 'released-early' };
  });
}
