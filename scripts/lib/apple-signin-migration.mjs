
/**
 * Sign in with Apple user migration for an App Store app transfer between Apple
 * developer teams (TN3159). The pure half of
 * `scripts/admin-apple-signin-migration.mjs`; the procedure and who runs which
 * step is in `docs/plans/ongoing/apple-team-transfer.md`.
 *
 * A Sign in with Apple `sub` is scoped to the developer team, and Firebase Auth
 * keys the `apple.com` provider on it. After the transfer every Apple user signs
 * in with a new `sub`, so each Firebase account has to be re-linked from the old
 * one to the new one, through a transfer identifier only the two teams can mint
 * and redeem.
 */

import crypto from 'node:crypto';

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_MIGRATION_URL = 'https://appleid.apple.com/auth/usermigrationinfo';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
const APPLE_PROVIDER_ID = 'apple.com';
// Apple rejects a client secret whose exp is more than six months after iat.
const CLIENT_SECRET_TTL_SECONDS = 60 * 60;

function assertTeamId(teamId, flag) {
  if (typeof teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error(`${flag} must be a ten-character Apple Team ID, got ${JSON.stringify(teamId)}`);
  }
}

const base64url = (value) => Buffer.from(value).toString('base64url');

/** The ES256 client secret Apple's REST endpoints take, signed with a team's Sign in with Apple key. */
function buildClientSecret({ teamId, keyId, privateKeyPem, clientId, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: teamId,
      iat: nowSeconds,
      exp: nowSeconds + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: clientId,
    }),
  );
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

async function postForm({ url, form, accessToken, fetchImpl }) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetchImpl(url, { method: 'POST', headers, body: new URLSearchParams(form).toString() });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Apple ${url} answered ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

/** A team-wide access token for the migration endpoint (valid one hour). */
async function requestMigrationToken({ teamId, keyId, privateKeyPem, clientId, fetchImpl = fetch }) {
  const body = await postForm({
    url: APPLE_TOKEN_URL,
    form: {
      grant_type: 'client_credentials',
      scope: 'user.migration',
      client_id: clientId,
      client_secret: buildClientSecret({ teamId, keyId, privateKeyPem, clientId }),
    },
    fetchImpl,
  });
  if (!body.access_token) throw new Error(`Apple token response carried no access_token: ${JSON.stringify(body)}`);
  return body.access_token;
}

/** Sending team: the transfer identifier for one of its users, addressed to the recipient team. */
async function generateTransferSub({ teamId, keyId, privateKeyPem, clientId, accessToken, sub, targetTeamId, fetchImpl = fetch }) {
  const body = await postForm({
    url: APPLE_MIGRATION_URL,
    accessToken,
    form: {
      sub,
      target: targetTeamId,
      client_id: clientId,
      client_secret: buildClientSecret({ teamId, keyId, privateKeyPem, clientId }),
    },
    fetchImpl,
  });
  if (!body.transfer_sub) throw new Error(`Apple returned no transfer_sub: ${JSON.stringify(body)}`);
  return body.transfer_sub;
}

/**
 * Recipient team: the user's new team-scoped sub, and their new relay address
 * when they hid their email (Apple returns `email` only in that case).
 */
async function exchangeTransferSub({ teamId, keyId, privateKeyPem, clientId, accessToken, transferSub, fetchImpl = fetch }) {
  const body = await postForm({
    url: APPLE_MIGRATION_URL,
    accessToken,
    form: {
      transfer_sub: transferSub,
      client_id: clientId,
      client_secret: buildClientSecret({ teamId, keyId, privateKeyPem, clientId }),
    },
    fetchImpl,
  });
  if (!body.sub) throw new Error(`Apple returned no sub for a transfer id: ${JSON.stringify(body)}`);
  return {
    sub: body.sub,
    email: body.email || null,
    isPrivateEmail: body.is_private_email === true || body.is_private_email === 'true',
  };
}

const appleProviderOf = (user) => (user?.providerData || []).find((p) => p?.providerId === APPLE_PROVIDER_ID) || null;

function appleSubOf(user) {
  return appleProviderOf(user)?.uid || null;
}

/** The export row for one Firebase user, or null when it has no Apple provider. */
function exportRow(user) {
  const sub = appleSubOf(user);
  return sub ? { uid: user.uid, sub } : null;
}

function pendingRows(rows, doneRows) {
  const done = new Set(doneRows.map((r) => r.uid));
  return rows.filter((r) => !done.has(r.uid));
}

/**
 * What to do with one Firebase account, given the exchanged row and whichever
 * account (if any) already holds the new sub. Pure, so every branch is tested;
 * the CLI only reads the inputs and applies the plan.
 *
 * A relink is two `auth.updateUser` calls — `unlinkFirst`, then `link` —
 * because Firebase rejects unlinking and linking the same provider in one
 * update (PROVIDER_ALREADY_LINKED). `backedUpApple` is the Apple provider this
 * tool saved before an earlier unlink, so a run that died between the two calls
 * finishes the link on re-run instead of reporting the account as Apple-less.
 *
 * Actions: `relink`, `already-relinked`, `conflict` (someone signed in fresh
 * after the transfer and got an empty account — merge by hand),
 * `no-apple-provider`, `missing-user`.
 */
function planRelink({ user, row, newSubOwnerUid, backedUpApple = null }) {
  if (!user) return { action: 'missing-user', uid: row.uid };

  const current = appleProviderOf(user);
  if (current?.uid === row.sub) return { action: 'already-relinked', uid: user.uid };
  if (newSubOwnerUid && newSubOwnerUid !== user.uid) {
    return { action: 'conflict', uid: user.uid, conflictingUid: newSubOwnerUid };
  }
  const previous = current || backedUpApple;
  if (!previous) return { action: 'no-apple-provider', uid: user.uid };

  const providerEmail = row.isPrivateEmail && row.email ? row.email : previous.email;
  const providerToLink = { providerId: APPLE_PROVIDER_ID, uid: row.sub };
  if (providerEmail) providerToLink.email = providerEmail;
  if (previous.displayName) providerToLink.displayName = previous.displayName;

  const link = { providerToLink };
  // Only follow the relay when the account email still is the old relay: a user
  // who later set their own address keeps it.
  if (row.isPrivateEmail && row.email && previous.email && user.email === previous.email) {
    link.email = row.email;
  }
  return { action: 'relink', uid: user.uid, unlinkFirst: Boolean(current), link };
}

const findUser = async (lookup) => {
  try {
    return await lookup();
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
};

/**
 * The production-write loop: plan each exchanged row against Firebase Auth and,
 * when `apply`, re-link it — backup, unlink, link, then confirm the new sub
 * resolves to the same account. `auth` is firebase-admin's Auth (or a fake);
 * `recordBackup` must persist synchronously, before the unlink, because it is
 * what a re-run reads (`backedUpAppleByUid`) to finish an interrupted relink.
 * Throws on the first failed write: a re-run resumes, and nothing is skipped.
 */
async function relinkUsers({ rows, auth, apply, backedUpAppleByUid = new Map(), recordBackup }) {
  const counts = {};
  const report = [];
  for (const row of rows) {
    const user = await findUser(() => auth.getUser(row.uid));
    const owner = await findUser(() => auth.getUserByProviderUid(APPLE_PROVIDER_ID, row.sub));
    const plan = planRelink({
      user,
      row,
      newSubOwnerUid: owner?.uid || null,
      backedUpApple: backedUpAppleByUid.get(row.uid) || null,
    });

    if (plan.action === 'relink' && apply) {
      if (plan.unlinkFirst) {
        recordBackup({ uid: user.uid, email: user.email || null, providerData: user.providerData });
        await auth.updateUser(user.uid, { providersToUnlink: [APPLE_PROVIDER_ID] });
      }
      await auth.updateUser(user.uid, plan.link);
      const relinked = await auth.getUserByProviderUid(APPLE_PROVIDER_ID, row.sub);
      if (relinked.uid !== user.uid) throw new Error(`re-link of ${user.uid} did not take: new sub resolves to ${relinked.uid}`);
    }

    counts[plan.action] = (counts[plan.action] || 0) + 1;
    const entry = { action: plan.action, uid: plan.uid };
    if (plan.action === 'conflict') {
      entry.conflictingUid = plan.conflictingUid;
      entry.conflictCreatedAt = owner.metadata?.creationTime;
    }
    report.push(entry);
  }
  return { counts, report };
}

// The only results after which an account needs nothing more: re-linked now,
// re-linked by an earlier run, or deleted since the export.
const RESOLVED_RELINK_ACTIONS = new Set(['relink', 'already-relinked', 'missing-user']);
const RELINK_UNRESOLVED_EXIT_CODE = 3;

/** The CLI's exit for a relink run: non-zero whenever any account is left to handle by hand. */
function relinkOutcome(counts) {
  const unresolved = Object.fromEntries(Object.entries(counts).filter(([action]) => !RESOLVED_RELINK_ACTIONS.has(action)));
  return { exitCode: Object.keys(unresolved).length ? RELINK_UNRESOLVED_EXIT_CODE : 0, unresolved };
}

export {
  APPLE_TOKEN_URL,
  APPLE_MIGRATION_URL,
  APPLE_PROVIDER_ID,
  assertTeamId,
  buildClientSecret,
  requestMigrationToken,
  generateTransferSub,
  exchangeTransferSub,
  appleSubOf,
  exportRow,
  pendingRows,
  planRelink,
  relinkUsers,
  relinkOutcome,
};
