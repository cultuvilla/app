/**
 * The `APNS_AUTH_KEY` secret's shape, mirrored from functions/src/push/apnsJwt.ts
 * (`parseApnsSecret`): `{ teamId, keyId, privateKey }`. Kept pure so
 * scripts/set-apns-key.mjs can refuse to write a value the functions would read
 * as "missing or malformed" — which silently stops every iOS push.
 */

export const TEAM_ID_RE = /^[A-Z0-9]{10}$/;

/** The secret's JSON for a team, key id and .p8 contents; throws on anything the functions would reject. */
export function buildApnsSecret({ teamId, keyId, privateKey }) {
  if (!TEAM_ID_RE.test(teamId ?? '')) throw new Error(`teamId must be a ten-character Apple Team ID, got ${JSON.stringify(teamId)}`);
  if (!keyId) throw new Error('keyId is required');
  if (!String(privateKey ?? '').includes('PRIVATE KEY')) throw new Error('privateKey is not a .p8 PEM');
  return JSON.stringify({ teamId, keyId, privateKey: privateKey.trim() + '\n' });
}

/** The same secret with its team replaced — for stamping the current key with the team that issued it. */
export function withTeamId(rawSecret, teamId) {
  let parsed;
  try {
    parsed = JSON.parse(rawSecret);
  } catch {
    throw new Error('the current secret is not JSON');
  }
  return buildApnsSecret({ teamId, keyId: parsed.keyId, privateKey: parsed.privateKey });
}

/** What may be printed about a secret: never the key itself. */
export function describeApnsSecret(raw) {
  const { teamId = null, keyId = null } = JSON.parse(raw);
  return { teamId, keyId };
}
