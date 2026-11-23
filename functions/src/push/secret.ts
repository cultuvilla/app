import { defineSecret } from 'firebase-functions/params';

/**
 * APNs token-auth credentials, as JSON: `{ "teamId": "8HWS4483VD", "keyId":
 * "ABC123DEFG", "privateKey": "-----BEGIN PRIVATE KEY-----\n…" }` — the issuing
 * team, the Key ID and the contents of the `.p8` downloaded from the Apple
 * Developer portal (Keys → Apple Push Notifications service). Written by
 * `scripts/set-apns-key.mjs`.
 *
 * One secret rather than three so the set cannot be rotated part-way: the Team
 * ID is not secret, but a key signs only for its own team, so they change
 * together (an Apple team transfer).
 *
 * Must exist in each env's Secret Manager BEFORE the deploy that first binds
 * it: a bound secret that does not exist fails the whole `firebase deploy`.
 */
export const APNS_AUTH_KEY = defineSecret('APNS_AUTH_KEY');
