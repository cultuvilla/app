#!/usr/bin/env node
/**
 * After a deploy, sign in as a real (non-admin) user and upload an image to
 * every village-scoped path the app uploads to, against the live Storage
 * rules. Fails when any upload is refused.
 *
 * 2026-10-07: storage.rules gated those writes on cross-service
 * firestore.exists(). The emulator evaluates those lookups; every deployed
 * project denies them. The rules suite passed, the deploy was green, and every
 * event cover in prod failed with "No tienes permiso para hacer esta acción".
 * Only a real upload against the real rules can see that class of failure.
 *
 * The smoke user is a dedicated Auth account with no Firestore docs, so it
 * holds no membership and no role. A path that starts requiring one will fail
 * here — on purpose: either the rule is wrong, or the smoke must be taught to
 * seed that authority before the rule ships.
 *
 *   node scripts/smoke-storage-upload.mjs --env=<dev|beta|prod> [--api-key=…]
 *
 * The web API key comes from --api-key or FIREBASE_WEB_API_KEY (the deploy
 * passes the env's FIREBASE_API_KEY variable).
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import { ENVS, initAdminForEnv, resolveEnv } from './lib/env-credentials.mjs';

export const SMOKE_UID = 'ci-storage-smoke';
export const SMOKE_EMAIL = 'ci-storage-smoke@cultuvilla.invalid';
/** Never a real doc id; fixed so each run overwrites the last run's object. */
export const SMOKE_ID = '__ci-smoke__';

/** The upload paths of imageService, with a real village where one is needed. */
export function smokePaths(municipalityId) {
  const m = municipalityId;
  return [
    `municipalities/${m}/images/${SMOKE_ID}.png`,
    `municipalities/${m}/events/${SMOKE_ID}/image/${SMOKE_ID}.png`,
    `municipalities/${m}/places/${SMOKE_ID}/image/${SMOKE_ID}.png`,
    `municipalities/${m}/barrios/${SMOKE_ID}/image/${SMOKE_ID}.png`,
    `festivalPosters/${m}/${SMOKE_ID}/${SMOKE_ID}.png`,
    `historyEntries/${m}/${SMOKE_ID}/${SMOKE_ID}.png`,
    `organizations/${SMOKE_ID}/image/${SMOKE_ID}.png`,
    `news/${SMOKE_ID}/images/${SMOKE_ID}.png`,
    `users/${SMOKE_UID}/photo/${SMOKE_ID}.png`,
  ];
}

export function uploadUrl(bucket, path) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(path)}`;
}

// A 1×1 PNG: real image bytes, so the variants trigger handles it like any upload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function smokeUserPassword() {
  const password = randomBytes(24).toString('base64url');
  try {
    await admin.auth().updateUser(SMOKE_UID, { password });
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
    await admin.auth().createUser({ uid: SMOKE_UID, email: SMOKE_EMAIL, password, emailVerified: true });
  }
  return password;
}

async function idToken(apiKey, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SMOKE_EMAIL, password, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`sign-in failed: ${body?.error?.message ?? res.status}`);
  return body.idToken;
}

/** Whether a refused upload may succeed on a later attempt. */
export function isRetryable(status) {
  return status === 403 || status >= 500;
}

// A refusal straight after a rules deploy can be the previous ruleset still
// being served, so a 403 (and any 5xx or network error) is retried.
export async function upload(
  bucket,
  path,
  token,
  { attempts = 6, delayMs = 15_000, fetchImpl = fetch, sleepImpl = sleep } = {},
) {
  let last = '';
  for (let i = 1; i <= attempts; i++) {
    let status;
    try {
      const res = await fetchImpl(uploadUrl(bucket, path), {
        method: 'POST',
        headers: { Authorization: `Firebase ${token}`, 'Content-Type': 'image/png' },
        body: PNG,
      });
      if (res.ok) return { path, ok: true, status: `HTTP ${res.status}` };
      status = res.status;
      last = `HTTP ${status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    if (status !== undefined && !isRetryable(status)) break;
    if (i < attempts) await sleepImpl(delayMs);
  }
  return { path, ok: false, status: last };
}

/** Upload every path in turn; resolves to one result per path. */
export async function runSmoke({ bucket, paths, token, uploadImpl = upload }) {
  const results = [];
  for (const path of paths) results.push(await uploadImpl(bucket, path, token));
  return results;
}

/** The deploy-failing error for these results, or null when every upload passed. */
export function failureMessage(env, results) {
  const failed = results.filter((r) => !r.ok);
  if (results.length === 0) return `::error::Storage upload smoke on ${env} uploaded nothing.`;
  if (failed.length === 0) return null;
  return (
    `::error::Storage refuses ${failed.length} upload path(s) on ${env} for a signed-in user. ` +
    'Every image upload on those paths fails in the app. Check storage.rules (see its header).'
  );
}

async function main() {
  const env = resolveEnv(process.argv.find((a) => a.startsWith('--env='))?.slice('--env='.length));
  const apiKey =
    process.argv.find((a) => a.startsWith('--api-key='))?.slice('--api-key='.length) ??
    process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('No web API key: pass --api-key= or set FIREBASE_WEB_API_KEY.');

  initAdminForEnv(env);
  const bucket = `${ENVS[env].project}.firebasestorage.app`;
  const village = await admin
    .firestore()
    .collection('municipalities')
    .where('communityActive', '==', true)
    .limit(1)
    .get();
  if (village.empty) throw new Error(`no active village in ${env} to upload against`);

  const token = await idToken(apiKey, await smokeUserPassword());
  const results = await runSmoke({ bucket, paths: smokePaths(village.docs[0].id), token });

  for (const r of results) console.log(`${r.ok ? '✅' : '❌'} ${r.path} — ${r.status}`);
  const error = failureMessage(env, results);
  if (error) {
    console.error(error);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::Storage upload smoke could not run: ${err.message}`);
    process.exit(1);
  });
}
