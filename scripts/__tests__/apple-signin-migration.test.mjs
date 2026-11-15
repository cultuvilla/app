// Unit tests for scripts/lib/apple-signin-migration.mjs — the Sign in with Apple
// user migration that accompanies moving the iOS app to another Apple team
// (docs/plans/ongoing/apple-team-transfer.md).
//
// What a bug here costs: every Apple-only user comes back after the transfer
// with a new team-scoped `sub`, and Firebase hands them an empty account. The
// Apple endpoints cannot be exercised from CI, so they are driven through a fake
// fetch that asserts the exact wire format Apple documents (TN3159).
//
// Run with: node --test scripts/__tests__/apple-signin-migration.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPLE_TOKEN_URL,
  APPLE_MIGRATION_URL,
  buildClientSecret,
  requestMigrationToken,
  generateTransferSub,
  exchangeTransferSub,
  appleSubOf,
  exportRow,
  planRelink,
  pendingRows,
  assertTeamId,
  relinkUsers,
  relinkOutcome,
} from '../lib/apple-signin-migration.mjs';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PRIVATE_KEY_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });

const CREDS = {
  teamId: 'AAAAAAAAAA',
  keyId: 'KEYID12345',
  privateKeyPem: PRIVATE_KEY_PEM,
  clientId: 'com.cultuvilla.app',
};

const decodeSegment = (segment) => JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

/** A fetch that records each call and answers from a queue of [status, body]. */
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, headers: init.headers, form: new URLSearchParams(init.body) });
    const [status, body] = responses.shift();
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    };
  };
  return { impl, calls };
}

// ── client secret ──────────────────────────────────────────────────────

test('the client secret is an ES256 JWT Apple accepts: kid, iss, sub=client id, aud', () => {
  const now = 1_790_000_000;
  const jwt = buildClientSecret({ ...CREDS, nowSeconds: now });
  const [header, payload, signature] = jwt.split('.');

  assert.deepEqual(decodeSegment(header), { alg: 'ES256', kid: 'KEYID12345', typ: 'JWT' });
  const claims = decodeSegment(payload);
  assert.equal(claims.iss, 'AAAAAAAAAA');
  assert.equal(claims.sub, 'com.cultuvilla.app');
  assert.equal(claims.aud, 'https://appleid.apple.com');
  assert.equal(claims.iat, now);
  assert.ok(claims.exp > now && claims.exp - now <= 15_777_000, 'Apple caps exp at six months');

  const verified = crypto.verify(
    'sha256',
    Buffer.from(`${header}.${payload}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature, 'base64url'),
  );
  assert.equal(verified, true);
});

test('a team id that is not ten characters is refused before any request', () => {
  assert.throws(() => assertTeamId('78RB67NT3', '--team-id'), /ten/);
  assert.doesNotThrow(() => assertTeamId('78RB67NT38', '--team-id'));
});

// ── Apple endpoints ────────────────────────────────────────────────────

test('the migration token is a client_credentials grant scoped to user.migration', async () => {
  const { impl, calls } = fakeFetch([[200, { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 }]]);

  const token = await requestMigrationToken({ ...CREDS, fetchImpl: impl });

  assert.equal(token, 'tok');
  assert.equal(calls[0].url, APPLE_TOKEN_URL);
  assert.equal(calls[0].form.get('grant_type'), 'client_credentials');
  assert.equal(calls[0].form.get('scope'), 'user.migration');
  assert.equal(calls[0].form.get('client_id'), 'com.cultuvilla.app');
  assert.ok(calls[0].form.get('client_secret').split('.').length === 3);
});

test('an Apple error is thrown with its body, never read as an empty result', async () => {
  const { impl } = fakeFetch([[400, { error: 'invalid_client' }]]);

  await assert.rejects(requestMigrationToken({ ...CREDS, fetchImpl: impl }), /400.*invalid_client/);
});

test('the sending team posts the user sub and the recipient team id', async () => {
  const { impl, calls } = fakeFetch([[200, { transfer_sub: '760417.abc.1827' }]]);

  const transferSub = await generateTransferSub({
    ...CREDS,
    accessToken: 'tok',
    sub: '001.old.0001',
    targetTeamId: 'BBBBBBBBBB',
    fetchImpl: impl,
  });

  assert.equal(transferSub, '760417.abc.1827');
  assert.equal(calls[0].url, APPLE_MIGRATION_URL);
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].form.get('sub'), '001.old.0001');
  assert.equal(calls[0].form.get('target'), 'BBBBBBBBBB');
  assert.equal(calls[0].form.get('client_id'), 'com.cultuvilla.app');
});

test('a 200 without transfer_sub is an error, not a user to skip silently', async () => {
  const { impl } = fakeFetch([[200, {}]]);

  await assert.rejects(
    generateTransferSub({ ...CREDS, accessToken: 'tok', sub: 's', targetTeamId: 'BBBBBBBBBB', fetchImpl: impl }),
    /transfer_sub/,
  );
});

test('the recipient exchanges a transfer id for its own sub and relay email', async () => {
  const { impl, calls } = fakeFetch([
    [200, { sub: '820417.new.0219', email: 'ep9@privaterelay.appleid.com', is_private_email: true }],
  ]);

  const result = await exchangeTransferSub({ ...CREDS, accessToken: 'tok', transferSub: '760417.abc.1827', fetchImpl: impl });

  assert.deepEqual(result, { sub: '820417.new.0219', email: 'ep9@privaterelay.appleid.com', isPrivateEmail: true });
  assert.equal(calls[0].form.get('transfer_sub'), '760417.abc.1827');
  assert.equal(calls[0].form.get('sub'), null);
});

test('a user who shared their real email gets no email back, and that is not an error', async () => {
  const { impl } = fakeFetch([[200, { sub: '820417.new.0219' }]]);

  const result = await exchangeTransferSub({ ...CREDS, accessToken: 'tok', transferSub: 't', fetchImpl: impl });

  assert.deepEqual(result, { sub: '820417.new.0219', email: null, isPrivateEmail: false });
});

// ── export and resume ──────────────────────────────────────────────────

test('export keeps only users with an Apple provider, keyed by their Firebase uid', () => {
  const apple = { uid: 'u1', email: 'a@privaterelay.appleid.com', providerData: [{ providerId: 'apple.com', uid: 'S1' }] };
  const google = { uid: 'u2', email: 'g@x.com', providerData: [{ providerId: 'google.com', uid: 'G' }] };

  assert.deepEqual(exportRow(apple), { uid: 'u1', sub: 'S1' });
  assert.equal(exportRow(google), null);
  assert.equal(appleSubOf(google), null);
});

test('a re-run skips the users already written, so a crash costs nothing', () => {
  const rows = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];

  assert.deepEqual(pendingRows(rows, [{ uid: 'b' }]).map((r) => r.uid), ['a', 'c']);
});

// ── relink planning ────────────────────────────────────────────────────

const appleUser = ({ uid = 'u1', email = 'old@privaterelay.appleid.com', sub = 'OLD', appleEmail = email, extra = [] } = {}) => ({
  uid,
  email,
  providerData: [{ providerId: 'apple.com', uid: sub, email: appleEmail, displayName: 'Ana' }, ...extra],
});

test('a migrated user is unlinked, then linked to the new sub, following the new relay email', () => {
  // Two calls, not one: Firebase rejects an update that unlinks and links the
  // same provider together (PROVIDER_ALREADY_LINKED — seen on dev 2026-10-03,
  // although the Auth emulator accepts it).
  const plan = planRelink({
    user: appleUser(),
    row: { uid: 'u1', sub: 'NEW', email: 'new@privaterelay.appleid.com', isPrivateEmail: true },
    newSubOwnerUid: null,
  });

  assert.equal(plan.action, 'relink');
  assert.equal(plan.unlinkFirst, true);
  assert.deepEqual(plan.link, {
    providerToLink: { providerId: 'apple.com', uid: 'NEW', email: 'new@privaterelay.appleid.com', displayName: 'Ana' },
    email: 'new@privaterelay.appleid.com',
  });
});

test('a user who shared their real email keeps it, on the account and on the provider', () => {
  const plan = planRelink({
    user: appleUser({ email: 'ana@gmail.com' }),
    row: { uid: 'u1', sub: 'NEW', email: null, isPrivateEmail: false },
    newSubOwnerUid: null,
  });

  assert.equal(plan.action, 'relink');
  assert.equal(plan.link.email, undefined);
  assert.equal(plan.link.providerToLink.email, 'ana@gmail.com');
});

test('an account email the user changed away from the old relay is left alone', () => {
  const plan = planRelink({
    user: appleUser({ email: 'ana@gmail.com', appleEmail: 'old@privaterelay.appleid.com', extra: [{ providerId: 'password', uid: 'ana@gmail.com' }] }),
    row: { uid: 'u1', sub: 'NEW', email: 'new@privaterelay.appleid.com', isPrivateEmail: true },
    newSubOwnerUid: null,
  });

  assert.equal(plan.link.email, undefined);
  assert.equal(plan.link.providerToLink.email, 'new@privaterelay.appleid.com');
});

test('a user already carrying the new sub is skipped, so the run can be repeated', () => {
  const plan = planRelink({
    user: appleUser({ sub: 'NEW' }),
    row: { uid: 'u1', sub: 'NEW', email: null, isPrivateEmail: false },
    newSubOwnerUid: 'u1',
  });

  assert.equal(plan.action, 'already-relinked');
  assert.equal(plan.link, undefined);
});

test('a new sub already owned by another account is a conflict to merge by hand, never a write', () => {
  const plan = planRelink({
    user: appleUser(),
    row: { uid: 'u1', sub: 'NEW', email: null, isPrivateEmail: false },
    newSubOwnerUid: 'fresh-empty-account',
  });

  assert.equal(plan.action, 'conflict');
  assert.equal(plan.conflictingUid, 'fresh-empty-account');
  assert.equal(plan.link, undefined);
});

test('an account without an Apple provider and no backup of ours is reported, not linked', () => {
  const plan = planRelink({
    user: { uid: 'u1', email: 'a@b.c', providerData: [{ providerId: 'password', uid: 'a@b.c' }] },
    row: { uid: 'u1', sub: 'NEW', email: null, isPrivateEmail: false },
    newSubOwnerUid: null,
    backedUpApple: null,
  });

  assert.equal(plan.action, 'no-apple-provider');
});

test('a run interrupted between unlink and link finishes the link from the backup on re-run', () => {
  const plan = planRelink({
    user: { uid: 'u1', email: 'old@privaterelay.appleid.com', providerData: [] },
    row: { uid: 'u1', sub: 'NEW', email: 'new@privaterelay.appleid.com', isPrivateEmail: true },
    newSubOwnerUid: null,
    backedUpApple: { providerId: 'apple.com', uid: 'OLD', email: 'old@privaterelay.appleid.com', displayName: 'Ana' },
  });

  assert.equal(plan.action, 'relink');
  assert.equal(plan.unlinkFirst, false);
  assert.deepEqual(plan.link, {
    providerToLink: { providerId: 'apple.com', uid: 'NEW', email: 'new@privaterelay.appleid.com', displayName: 'Ana' },
    email: 'new@privaterelay.appleid.com',
  });
});

test('a deleted account is reported as missing', () => {
  const plan = planRelink({ user: null, row: { uid: 'gone', sub: 'NEW' }, newSubOwnerUid: null });

  assert.equal(plan.action, 'missing-user');
});

// ── relinkUsers: the production-write loop ─────────────────────────────


/**
 * An in-memory Auth with the two behaviours of real Firebase the loop depends
 * on: unlinking and linking `apple.com` in one update is rejected, and a
 * provider uid can belong to one account only. `failOn(n)` throws on the n-th
 * updateUser call, to cut a run in half.
 */
function fakeAuth(users) {
  const state = new Map(users.map((u) => [u.uid, structuredClone(u)]));
  const calls = [];
  let failAt = null;
  const notFound = () => Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
  return {
    calls,
    state,
    failOn(n) { failAt = n; },
    async getUser(uid) {
      if (!state.has(uid)) throw notFound();
      return structuredClone(state.get(uid));
    },
    async getUserByProviderUid(providerId, uid) {
      for (const u of state.values()) {
        if (u.providerData.some((p) => p.providerId === providerId && p.uid === uid)) return structuredClone(u);
      }
      throw notFound();
    },
    async updateUser(uid, update) {
      calls.push({ uid, update });
      if (failAt !== null && calls.length === failAt) throw new Error('injected failure');
      const user = state.get(uid);
      if (update.providersToUnlink && update.providerToLink) throw new Error('PROVIDER_ALREADY_LINKED');
      if (update.providersToUnlink) {
        user.providerData = user.providerData.filter((p) => !update.providersToUnlink.includes(p.providerId));
      }
      if (update.providerToLink) {
        const link = update.providerToLink;
        if (user.providerData.some((p) => p.providerId === link.providerId)) throw new Error('PROVIDER_ALREADY_LINKED');
        for (const other of state.values()) {
          if (other.providerData.some((p) => p.providerId === link.providerId && p.uid === link.uid)) {
            throw new Error('FEDERATED_USER_ID_ALREADY_LINKED');
          }
        }
        user.providerData.push({ ...link });
      }
      if (update.email) user.email = update.email;
    },
  };
}

const twoAppleUsers = () => [
  appleUser({ uid: 'u1', sub: 'OLD1', email: 'old1@privaterelay.appleid.com' }),
  appleUser({ uid: 'u2', sub: 'OLD2', email: 'ana@gmail.com' }),
];
const exchangedRows = [
  { uid: 'u1', sub: 'NEW1', email: 'new1@privaterelay.appleid.com', isPrivateEmail: true },
  { uid: 'u2', sub: 'NEW2', email: null, isPrivateEmail: false },
];
const appleUidOf = (auth, uid) => auth.state.get(uid).providerData.find((p) => p.providerId === 'apple.com')?.uid;

test('a dry run plans every user and writes nothing — no update, no backup', async () => {
  const auth = fakeAuth(twoAppleUsers());
  const backups = [];

  const { counts } = await relinkUsers({ rows: exchangedRows, auth, apply: false, recordBackup: (b) => backups.push(b) });

  assert.deepEqual(counts, { relink: 2 });
  assert.equal(auth.calls.length, 0);
  assert.equal(backups.length, 0);
  assert.equal(appleUidOf(auth, 'u1'), 'OLD1');
});

test('apply backs up, unlinks, then links, and leaves each account on its new sub', async () => {
  const auth = fakeAuth(twoAppleUsers());
  const backups = [];

  const { counts } = await relinkUsers({ rows: exchangedRows, auth, apply: true, recordBackup: (b) => backups.push(b) });

  assert.deepEqual(counts, { relink: 2 });
  assert.deepEqual(auth.calls.map((c) => [c.uid, Object.keys(c.update).sort().join('+')]), [
    ['u1', 'providersToUnlink'],
    ['u1', 'email+providerToLink'],
    ['u2', 'providersToUnlink'],
    ['u2', 'providerToLink'],
  ]);
  assert.deepEqual(backups.map((b) => b.uid), ['u1', 'u2']);
  assert.equal(backups[0].providerData[0].uid, 'OLD1', 'the backup holds the pre-unlink provider');
  assert.equal(appleUidOf(auth, 'u1'), 'NEW1');
  assert.equal(auth.state.get('u1').email, 'new1@privaterelay.appleid.com');
  assert.equal(appleUidOf(auth, 'u2'), 'NEW2');
  assert.equal(auth.state.get('u2').email, 'ana@gmail.com');
});

test('the backup is written before the unlink, so a failed unlink loses nothing', async () => {
  const auth = fakeAuth(twoAppleUsers());
  const backups = [];
  auth.failOn(1);

  await assert.rejects(relinkUsers({ rows: exchangedRows, auth, apply: true, recordBackup: (b) => backups.push(b) }), /injected/);

  assert.deepEqual(backups.map((b) => b.uid), ['u1']);
  assert.equal(appleUidOf(auth, 'u1'), 'OLD1');
});

test('a run cut between unlink and link resumes from its backup and finishes', async () => {
  const auth = fakeAuth(twoAppleUsers());
  const backups = [];
  auth.failOn(2);

  await assert.rejects(relinkUsers({ rows: exchangedRows, auth, apply: true, recordBackup: (b) => backups.push(b) }), /injected/);
  assert.equal(appleUidOf(auth, 'u1'), undefined, 'u1 is stranded with no Apple provider');

  auth.failOn(null);
  const backedUpAppleByUid = new Map(backups.map((b) => [b.uid, b.providerData.find((p) => p.providerId === 'apple.com')]));
  const { counts } = await relinkUsers({ rows: exchangedRows, auth, apply: true, backedUpAppleByUid, recordBackup: (b) => backups.push(b) });

  assert.deepEqual(counts, { relink: 2 });
  assert.equal(appleUidOf(auth, 'u1'), 'NEW1');
  assert.equal(auth.state.get('u1').email, 'new1@privaterelay.appleid.com');
  assert.equal(appleUidOf(auth, 'u2'), 'NEW2');
});

test('a second run over a finished migration writes nothing', async () => {
  const auth = fakeAuth(twoAppleUsers());
  await relinkUsers({ rows: exchangedRows, auth, apply: true, recordBackup: () => {} });
  const written = auth.calls.length;

  const { counts } = await relinkUsers({ rows: exchangedRows, auth, apply: true, recordBackup: () => {} });

  assert.deepEqual(counts, { 'already-relinked': 2 });
  assert.equal(auth.calls.length, written);
});

test('a conflict and a deleted account are reported, and nothing is written for either', async () => {
  const fresh = { uid: 'fresh', email: null, providerData: [{ providerId: 'apple.com', uid: 'NEW1' }], metadata: { creationTime: 'T' } };
  const auth = fakeAuth([fresh, appleUser({ uid: 'u1', sub: 'OLD1' })]);
  const rows = [exchangedRows[0], { uid: 'gone', sub: 'NEW9', email: null, isPrivateEmail: false }];

  const { counts, report } = await relinkUsers({ rows, auth, apply: true, recordBackup: () => {} });

  assert.deepEqual(counts, { conflict: 1, 'missing-user': 1 });
  assert.equal(auth.calls.length, 0);
  assert.deepEqual(report[0], { action: 'conflict', uid: 'u1', conflictingUid: 'fresh', conflictCreatedAt: 'T' });
});

// ── relinkOutcome: what the CLI exits with ─────────────────────────────


test('a relink that left every account resolved exits 0', () => {
  assert.deepEqual(relinkOutcome({ relink: 160, 'already-relinked': 7, 'missing-user': 2 }), { exitCode: 0, unresolved: {} });
});

test('a conflict or an account without an Apple provider fails the run, so a green exit always means done', () => {
  assert.deepEqual(relinkOutcome({ relink: 160, conflict: 1 }), { exitCode: 3, unresolved: { conflict: 1 } });
  assert.deepEqual(relinkOutcome({ 'no-apple-provider': 2 }), { exitCode: 3, unresolved: { 'no-apple-provider': 2 } });
});

test('an action the outcome does not know is unresolved, never a silent success', () => {
  assert.equal(relinkOutcome({ 'something-new': 1 }).exitCode, 3);
});

// ── the CLI itself, against a preloaded fake Firebase ──────────────────


const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', 'admin-apple-signin-migration.mjs');
const PRELOAD = path.join(HERE, 'fixtures', 'apple-signin-migration-fake-firebase.mjs');

function runRelinkCli({ users, rows, apply, backups = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-relink-'));
  const statePath = path.join(dir, 'auth.json');
  fs.writeFileSync(statePath, JSON.stringify({ users, writes: 0 }));
  fs.writeFileSync(path.join(dir, 'new-ids.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  if (backups.length) {
    fs.writeFileSync(path.join(dir, 'relink-backup.jsonl'), backups.map((b) => JSON.stringify(b)).join('\n') + '\n');
  }
  const args = ['--import', PRELOAD, CLI, 'relink', '--env=dev', `--dir=${dir}`];
  if (apply) args.push('--apply');
  const result = spawnSync(process.execPath, args, { env: { ...process.env, FAKE_AUTH_STATE: statePath }, encoding: 'utf8' });
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: result.status, stderr: result.stderr, state };
}

test('CLI: a clean apply re-links and exits 0', () => {
  const { status, state } = runRelinkCli({ users: [appleUser({ uid: 'u1', sub: 'OLD1' })], rows: [exchangedRows[0]], apply: true });

  assert.equal(status, 0);
  assert.equal(state.writes, 2);
  assert.equal(state.users[0].providerData.find((p) => p.providerId === 'apple.com').uid, 'NEW1');
});

test('CLI: a dry run writes nothing', () => {
  const { status, state } = runRelinkCli({ users: [appleUser({ uid: 'u1', sub: 'OLD1' })], rows: [exchangedRows[0]], apply: false });

  assert.equal(status, 0);
  assert.equal(state.writes, 0);
});

test('CLI: an unresolved conflict exits non-zero, in a dry run and in an apply', () => {
  const users = [
    appleUser({ uid: 'u1', sub: 'OLD1' }),
    { uid: 'fresh', email: null, providerData: [{ providerId: 'apple.com', uid: 'NEW1' }], metadata: { creationTime: 'T' } },
  ];
  for (const apply of [false, true]) {
    const { status, stderr, state } = runRelinkCli({ users, rows: [exchangedRows[0]], apply });

    assert.equal(status, 3);
    assert.match(stderr, /UNRESOLVED.*conflict/);
    assert.equal(state.writes, 0);
  }
});

test('CLI: an account with no Apple provider and no backup exits non-zero', () => {
  const users = [{ uid: 'u1', email: 'a@b.c', providerData: [{ providerId: 'password', uid: 'a@b.c' }] }];

  const { status, stderr } = runRelinkCli({ users, rows: [exchangedRows[0]], apply: true });

  assert.equal(status, 3);
  assert.match(stderr, /no-apple-provider/);
});

test('CLI: an account stranded between unlink and link is finished from relink-backup.jsonl', () => {
  // The state a run interrupted after the unlink leaves behind: no Apple
  // provider on the account, and the pre-unlink provider in the backup file.
  const users = [{ uid: 'u1', email: 'old1@privaterelay.appleid.com', providerData: [] }];
  const backups = [{
    uid: 'u1',
    email: 'old1@privaterelay.appleid.com',
    providerData: [{ providerId: 'apple.com', uid: 'OLD1', email: 'old1@privaterelay.appleid.com', displayName: 'Ana' }],
  }];

  const { status, state } = runRelinkCli({ users, rows: [exchangedRows[0]], apply: true, backups });

  assert.equal(status, 0);
  assert.equal(state.writes, 1, 'link only — there is nothing left to unlink');
  const apple = state.users[0].providerData.find((p) => p.providerId === 'apple.com');
  assert.deepEqual(apple, { providerId: 'apple.com', uid: 'NEW1', email: 'new1@privaterelay.appleid.com', displayName: 'Ana' });
  assert.equal(state.users[0].email, 'new1@privaterelay.appleid.com');
});

test('CLI: without that backup the same stranded account is unresolved, never silently skipped', () => {
  const users = [{ uid: 'u1', email: 'old1@privaterelay.appleid.com', providerData: [] }];

  const { status, state } = runRelinkCli({ users, rows: [exchangedRows[0]], apply: true });

  assert.equal(status, 3);
  assert.equal(state.writes, 0);
});

test('CLI: the Sign in with Apple client id is the prod bundle id', () => {
  // Apple scopes transfer ids to the client id; the dev or beta bundle would
  // mint ids no prod user has.
  assert.match(fs.readFileSync(CLI, 'utf8'), /const CLIENT_ID = 'com\.cultuvilla\.app';/);
});
