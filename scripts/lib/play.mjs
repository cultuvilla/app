/**
 * Google Play Developer API client: what is on a track, where each release is
 * in Google's review, and the two writes this repo makes — a release's "What's
 * new" and the store listing.
 *
 * Auth, first available wins:
 *  - a service account (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, the repo secret EAS
 *    submits with, or `--key-file`): an RS256 JWT exchanged for a token;
 *  - user Application Default Credentials (`authorized_user`, for a person
 *    reading from their laptop): a refresh-token exchange, billed to the ADC's
 *    quota project. That login needs the androidpublisher scope.
 * Both ask for scope `androidpublisher`.
 *
 *  - `listReleases` — applications.tracks.releases.list, the release LIFECYCLE
 *    (draft → in review → approved → published, or not approved). Edit-free.
 *    This is the only endpoint that exposes Play's review state.
 *  - `getTrack` — the edits API's track resource, which carries the rollout
 *    (`status`, `userFraction`) and the release notes the lifecycle does not.
 *    It needs an *edit*, so this opens one, reads, and deletes it without
 *    committing. An uncommitted edit changes nothing in the Play Console.
 *  - `setReleaseNotes` / `pushListing` — open an edit, change one thing, commit.
 *
 * Adapted from ordago-apps' scripts/lib/stores/play.js. `fetchImpl` is
 * injectable so the flow is testable without the network.
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/** Play caps a release's "What's new" at 500 characters per language. */
export const MAX_PLAY_NOTES = 500;

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function signJwt(sa, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

export const hasVersionCode = (versionCode) => versionCode != null && versionCode !== '';

/** Matches `version` inside a release name, but not inside a longer one (1.5.0 vs 1.5.01). */
export const versionNameRe = (version) => new RegExp(`(^|[^\\d.])${String(version).replace(/\./g, '\\.')}([^\\d.]|$)`);

/**
 * The edits-API release of one build on a track: by versionCode when there is
 * one, else by name (Play names a release after the bundle's versionName, and
 * EAS sets no name). A code that matches nothing is not found — never a name
 * match, which could be another build of the same version.
 */
export function findTrackRelease(track, { versionCode, version }) {
  const releases = track?.releases ?? [];
  if (hasVersionCode(versionCode)) {
    return releases.find((r) => (r.versionCodes ?? []).map(String).includes(String(versionCode))) ?? null;
  }
  return releases.find((r) => versionNameRe(version).test(String(r.name ?? ''))) ?? null;
}

/** A parsed credential JSON → `{ kind, ... }`, or throws naming `source`. */
function classifyCredential(obj, source) {
  if (obj?.client_email && obj?.private_key) return { kind: 'service_account', sa: obj, identity: obj.client_email };
  if (obj?.refresh_token && obj?.client_id && obj?.client_secret) {
    return { kind: 'authorized_user', adc: obj, identity: `ADC ${obj.account || `${String(obj.client_id).split('-')[0]}…`}` };
  }
  throw new Error(
    `${source}: need a service account (client_email + private_key) or user ADC (refresh_token + client_id + client_secret)`,
  );
}

function parseCredential(json, source) {
  let obj;
  try {
    obj = JSON.parse(json);
  } catch (err) {
    throw new Error(`${source} is not valid JSON: ${err.message}`);
  }
  return classifyCredential(obj, source);
}

/**
 * The credential a local command uses: `--key-file`, then the CI secret, then
 * the stored user ADC (`~/.config/cultuvilla/adc.json`, the repo's keyless
 * convention), then the system default ADC. `null` when there is none.
 */
export function resolvePlayCredential({
  keyFile,
  env = process.env,
  adcPaths = [
    path.join(homedir(), '.config/cultuvilla/adc.json'),
    env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(homedir(), '.config/gcloud/application_default_credentials.json'),
  ].filter(Boolean),
  readFile = (p) => readFileSync(p, 'utf8'),
} = {}) {
  if (keyFile) return parseCredential(readFile(keyFile), `--key-file ${keyFile}`);
  if (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    return parseCredential(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  }
  for (const p of adcPaths) {
    let raw;
    try {
      raw = readFile(p);
    } catch {
      continue;
    }
    return parseCredential(raw, p);
  }
  return null;
}

/**
 * A client bound to one credential, or `null` when none is configured —
 * which the announce poller treats as "cannot confirm live", never as live.
 * `serviceAccountJson` (default: the CI secret) is the poller's path;
 * `credential` is `resolvePlayCredential`'s answer, for the local commands.
 */
export function makePlayClient({
  serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON,
  credential,
  fetchImpl = fetch,
} = {}) {
  if (!credential) {
    if (!serviceAccountJson) return null;
    credential = parseCredential(serviceAccountJson, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    if (credential.kind !== 'service_account') {
      throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON needs client_email and private_key');
    }
  }
  // User ADC is billed to a project, and androidpublisher refuses without one.
  const quotaProject = credential.kind === 'authorized_user' ? credential.adc.quota_project_id : undefined;
  if (credential.kind === 'authorized_user' && !quotaProject) {
    throw new Error('the ADC has no quota_project_id; set one: gcloud auth application-default set-quota-project <project>');
  }

  let token;
  async function accessToken() {
    if (token) return token;
    const body = credential.kind === 'service_account'
      ? { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(credential.sa) }
      : {
          grant_type: 'refresh_token',
          refresh_token: credential.adc.refresh_token,
          client_id: credential.adc.client_id,
          client_secret: credential.adc.client_secret,
        };
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (!res.ok) throw new Error(`Play OAuth failed (${res.status}): ${await res.text()}`);
    token = (await res.json()).access_token;
    return token;
  }

  async function request(method, apiPath, body) {
    const res = await fetchImpl(`${PLAY_API}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        ...(quotaProject ? { 'X-Goog-User-Project': quotaProject } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok) {
      const text = await res.text();
      const hint = res.status === 403 && /scope/i.test(text)
        ? ' — the login lacks the androidpublisher scope (see the verify-play-release-notes skill)'
        : res.status === 403
          ? ' — this identity lacks the Play Console permission for this app (Users and permissions)'
          : '';
      throw new Error(`Play API ${method} ${apiPath} failed (${res.status}): ${text}${hint}`);
    }
    return res.status === 204 ? null : res.json();
  }

  /**
   * Run `fn(editPath)` inside a fresh edit. With `commit`, commit it after;
   * otherwise — or when `fn` throws — delete it. The caller's error is the one
   * worth reading; a failed cleanup only leaves an edit Play expires itself.
   */
  async function withEdit(packageName, fn, { commit } = {}) {
    const edits = `/applications/${packageName}/edits`;
    const edit = await request('POST', edits);
    const editPath = `${edits}/${edit.id}`;
    let result;
    try {
      result = await fn(editPath);
    } catch (err) {
      await request('DELETE', editPath).catch(() => {});
      throw err;
    }
    if (commit) {
      await request('POST', `${editPath}:commit${commit === true ? '' : `?${commit}`}`).catch(async (err) => {
        await request('DELETE', editPath).catch(() => {});
        throw err;
      });
    } else {
      await request('DELETE', editPath).catch(() => {});
    }
    return result;
  }

  return {
    identity: credential.identity,

    /**
     * `{ releases: [{ releaseName, track, activeArtifacts: [{ versionCode }],
     * releaseLifecycleState }] }` — every release on the track and its review state.
     */
    async listReleases(packageName, track) {
      return request('GET', `/applications/${packageName}/tracks/${track}/releases`);
    },

    /** The track resource: `{ track, releases: [{ name, versionCodes, status, userFraction?, releaseNotes? }] }`. */
    async getTrack(packageName, track) {
      return withEdit(packageName, (edit) => request('GET', `${edit}/tracks/${track}`));
    },

    /**
     * Set one language's "What's new" on the release of `versionCode` (else
     * of `version`, by name) and commit. Other languages' notes are kept.
     * Returns `{ found, release }`; when the release is not on the track yet
     * nothing is written and the edit is dropped.
     *
     * The commit takes Play's default for a change in review — cancel it and
     * resubmit with the notes — which is what a release that EAS submitted
     * seconds earlier wants: the notes belong in that review.
     */
    async setReleaseNotes(packageName, track, { versionCode, version, language, text }) {
      if (!text) throw new Error('setReleaseNotes: empty notes');
      if ([...text].length > MAX_PLAY_NOTES) {
        throw new Error(`setReleaseNotes: notes are ${[...text].length} characters; Play's limit is ${MAX_PLAY_NOTES}`);
      }
      let found = null;
      const NOT_FOUND = Symbol('not found');
      try {
        await withEdit(
          packageName,
          async (edit) => {
            const current = await request('GET', `${edit}/tracks/${track}`);
            const release = findTrackRelease(current, { versionCode, version });
            if (!release) throw NOT_FOUND;
            release.releaseNotes = [
              ...(release.releaseNotes ?? []).filter((n) => n.language !== language),
              { language, text },
            ];
            // A track update replaces the whole release list, so every
            // release goes back, the matched one carrying its new notes.
            await request('PUT', `${edit}/tracks/${track}`, { track, releases: current.releases });
            found = release;
          },
          { commit: true },
        );
      } catch (err) {
        if (err === NOT_FOUND) return { found: false, release: null };
        throw err;
      }
      return { found: true, release: found };
    },

    /**
     * Patch one language's title and descriptions, and commit. PATCH, not PUT:
     * a PUT replaces the whole listing and takes the promo video with it.
     * `ERROR_IF_IN_REVIEW`: a listing change must never cancel a release's
     * review, so it fails instead. Returns the listing it replaced.
     */
    async pushListing(packageName, language, { title, shortDescription, fullDescription }) {
      return withEdit(
        packageName,
        async (edit) => {
          const before = await request('GET', `${edit}/listings/${language}`).catch(() => null);
          await request('PATCH', `${edit}/listings/${language}`, { title, shortDescription, fullDescription });
          return before;
        },
        { commit: 'changesInReviewBehavior=ERROR_IF_IN_REVIEW' },
      );
    },
  };
}

/**
 * `{ packageName, track }` of an eas.json submit profile — the app and track
 * EAS just submitted to, so the notes go where the binary went.
 */
export function playSubmitTarget(profile, easJson) {
  const android = easJson?.submit?.[profile]?.android;
  if (!android?.applicationId || !android?.track) {
    const known = Object.keys(easJson?.submit ?? {}).filter((p) => easJson.submit[p]?.android).join(', ');
    throw new Error(`eas.json has no Android submit profile "${profile}" (known: ${known || 'none'})`);
  }
  return { packageName: android.applicationId, track: android.track };
}

/**
 * Set the notes once the release is on the track. EAS's `--wait` returns when
 * the submission has finished, but Play can take a moment to show the release
 * in a fresh edit, so a miss is retried before it is reported.
 * Returns the matched release; throws when it never appears.
 */
export async function pushReleaseNotesWhenReady({
  play,
  packageName,
  track,
  version,
  versionCode,
  language,
  text,
  attempts = 10,
  delayMs = 30_000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
}) {
  const by = hasVersionCode(versionCode) ? `versionCode ${versionCode}` : `name ${version}`;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { found, release } = await play.setReleaseNotes(packageName, track, { versionCode, version, language, text });
    if (found) {
      log(`${language} notes set on ${packageName} ${track} release "${release.name ?? '(unnamed)'}" (${by})`);
      return release;
    }
    if (attempt < attempts) {
      log(`no release with ${by} on ${packageName} ${track} yet (attempt ${attempt}/${attempts}); retrying`);
      await sleep(delayMs);
    }
  }
  throw new Error(`no release with ${by} on ${packageName} ${track} after ${attempts} attempts; nothing was written`);
}

/** A release as indented text: name, status, codes, rollout, notes. */
export function formatTrackRelease(release) {
  const out = [`name: ${release.name ?? '(unnamed)'}`, `status: ${release.status}`];
  if (release.versionCodes) out.push(`versionCodes: ${release.versionCodes.join(', ')}`);
  if (release.userFraction !== undefined) out.push(`userFraction: ${release.userFraction}`);
  const notes = release.releaseNotes ?? [];
  if (notes.length === 0) out.push('releaseNotes: (none)');
  for (const n of notes) {
    out.push(`releaseNotes ${n.language}:`);
    out.push(...String(n.text || '(empty)').split('\n').map((l) => `  ${l}`));
  }
  return out.map((l) => `    ${l}`).join('\n');
}

