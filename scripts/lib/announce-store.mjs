/**
 * The Firestore and store-API halves of announce-when-live, kept apart from the
 * CLI so tests drive them with a fake `db`, a fake Play client and a fake ASC.
 * Every decision is delegated to lib/announce.mjs; this file only reads, asks
 * and writes.
 */

import { listVersions } from './appstore-flows.mjs';
import { resolveAppVersionConfig } from './app-version-config.mjs';
import {
  interpretIosVersions,
  interpretPlayTrack,
  nextPending,
  pendingDocPath,
  planTick,
  PLATFORMS,
} from './announce.mjs';

export const CONFIG_DOC = 'config/appVersion';

/**
 * Which stores serve `pending.version` right now. Fails safe in every
 * direction: missing credentials, an API error or an unknown answer all read as
 * "not live", with a warning, so the next tick simply asks again. A platform
 * already announced is not asked.
 */
export async function checkStores({ pending, play, ascRequest, ascAppId, packageName, track, warn = () => {} }) {
  const live = { ios: false, android: false };
  const detail = {};

  if (pending.announced?.android) {
    live.android = true;
    detail.android = 'already announced';
  } else if (!play) {
    warn('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set — cannot confirm Android is live; treating it as not live.');
    detail.android = 'no Play credentials';
  } else {
    try {
      const r = interpretPlayTrack(await play.getTrack(packageName, track), {
        versionCode: pending.androidVersionCode,
        version: pending.version,
      });
      live.android = r.live;
      detail.android = r.found
        ? `${track} release ${r.status} at ${Math.round(r.userFraction * 100)}% (matched by ${r.via})`
        : `not on the ${track} track yet (looked up by ${r.via})`;
    } catch (err) {
      warn(`Play check failed (${err.message}) — treating Android as not live.`);
      detail.android = 'Play API error';
    }
  }

  if (pending.announced?.ios) {
    live.ios = true;
    detail.ios = 'already announced';
  } else if (!ascRequest || !ascAppId) {
    warn('App Store Connect credentials or ASC_APP_ID missing — cannot confirm iOS is live; treating it as not live.');
    detail.ios = 'no ASC credentials';
  } else {
    try {
      const r = interpretIosVersions(await listVersions(ascRequest, { ascAppId, limit: 20 }), pending.version);
      live.ios = r.live;
      detail.ios = r.found ? `${r.state} (build ${r.buildNumber ?? '?'})` : 'no App Store version yet';
      if (r.live && r.buildNumber) detail.iosBuildNumber = String(r.buildNumber);
    } catch (err) {
      warn(`ASC check failed (${err.message}) — treating iOS as not live.`);
      detail.ios = 'ASC API error';
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
export async function applyTick(db, { env, version, live, iosBuildNumber, dryRun = false, now = new Date().toISOString() }) {
  const pendingRef = db.doc(pendingDocPath(env));
  const configRef = db.doc(CONFIG_DOC);
  return db.runTransaction(async (tx) => {
    const pSnap = await tx.get(pendingRef);
    if (!pSnap.exists) return { outcome: 'gone' };
    const pending = pSnap.data();
    if (pending.version !== version) return { outcome: 'superseded', pending };
    const cSnap = await tx.get(configRef);
    const stored = cSnap.exists ? cSnap.data() : null;

    const plan = planTick(pending, { live, stored });
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
        ...(plan.deploySha ? { deployRequestedAt: now } : {}),
        updatedAt: now,
      });
    }
    return { outcome: plan.clear ? 'done' : plan.deploySha ? 'deploy' : 'waiting', plan, payload, pending };
  });
}

/**
 * The held deploy was dispatched: the release is finished. Bound to the SHA so
 * a newer release recorded in between is left alone.
 */
export async function finishAfterDispatch(db, { env, sha }) {
  const ref = db.doc(pendingDocPath(env));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { outcome: 'gone' };
    const pending = snap.data();
    const done = PLATFORMS.every((p) => pending.announced?.[p]);
    if (!done || (pending.backendSha ?? pending.releaseSha) !== sha) return { outcome: 'changed', pending };
    tx.delete(ref);
    return { outcome: 'done' };
  });
}
