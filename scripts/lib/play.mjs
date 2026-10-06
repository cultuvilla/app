/**
 * Read-only Google Play Developer API client: what is on a track right now?
 *
 * Auth is the same service account EAS submits with
 * (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, a repo secret): an RS256 JWT exchanged
 * for an access token. Reading a track needs an *edit* — Play has no
 * edit-free track endpoint — so this opens one, reads, and deletes it without
 * committing. An uncommitted edit changes nothing in the Play Console.
 *
 * Adapted from ordago-apps' scripts/lib/stores/play.js. `fetchImpl` is
 * injectable so the flow is testable without the network.
 */

import { createSign } from 'node:crypto';

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function signJwt(sa, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

/**
 * A client bound to one service account, or `null` when none is configured —
 * which the caller treats as "cannot confirm live", never as live.
 */
export function makePlayClient({ serviceAccountJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, fetchImpl = fetch } = {}) {
  if (!serviceAccountJson) return null;
  let sa;
  try {
    sa = JSON.parse(serviceAccountJson);
  } catch (err) {
    throw new Error(`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON: ${err.message}`);
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON needs client_email and private_key');
  }

  async function accessToken() {
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa) }),
    });
    if (!res.ok) throw new Error(`Play OAuth failed (${res.status}): ${await res.text()}`);
    return (await res.json()).access_token;
  }

  async function api(token, method, path) {
    const res = await fetchImpl(`${PLAY_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Play API ${method} ${path} failed (${res.status}): ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }

  return {
    /** The track resource: `{ track, releases: [{ name, versionCodes, status, userFraction? }] }`. */
    async getTrack(packageName, track) {
      const token = await accessToken();
      const edits = `/applications/${packageName}/edits`;
      const edit = await api(token, 'POST', edits);
      try {
        return await api(token, 'GET', `${edits}/${edit.id}/tracks/${track}`);
      } finally {
        await api(token, 'DELETE', `${edits}/${edit.id}`).catch(() => {});
      }
    },
  };
}
