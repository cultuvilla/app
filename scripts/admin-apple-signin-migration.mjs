/**
 * Sign in with Apple user migration for moving the iOS app to another Apple
 * developer team (TN3159). Ported from ordago-apps, which ran it first. Four
 * steps, run in order by two different people; the procedure, the order on the
 * day and who runs what are in docs/plans/ongoing/apple-team-transfer.md — read
 * it before running anything.
 *
 *   export    read the Apple users from Firebase Auth          (needs Firebase access)
 *   generate  SENDING team mints a transfer id per user        (sending team's key; BEFORE the transfer)
 *   exchange  RECEIVING team redeems them for its own subs      (receiving team's key; AFTER acceptance)
 *   relink    re-key each Firebase account to its new sub       (needs Firebase access; dry run by default)
 *
 * Every step reads and writes JSONL files in one working directory, so the
 * files can travel between the two people between steps. They identify users —
 * keep them out of the repo and out of chat; the default directory is outside
 * the checkout. generate and exchange append and skip what is already written,
 * so a crash or an Apple error is fixed by re-running the same command.
 *
 * USAGE:
 *   node scripts/admin-apple-signin-migration.mjs export   --env=prod
 *   node scripts/admin-apple-signin-migration.mjs generate --team-id=<SENDING> --key-id=<KEY> --key-file=<AuthKey.p8> --target-team-id=<RECEIVING>
 *   node scripts/admin-apple-signin-migration.mjs exchange --team-id=<RECEIVING> --key-id=<KEY> --key-file=<AuthKey.p8>
 *   node scripts/admin-apple-signin-migration.mjs relink   --env=prod [--apply]
 *
 *   --dir=<path>   working directory (default ~/backups/cultuvilla/apple-team-transfer)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  APPLE_PROVIDER_ID,
  assertTeamId,
  requestMigrationToken,
  generateTransferSub,
  exchangeTransferSub,
  exportRow,
  pendingRows,
  relinkUsers,
  relinkOutcome,
} from './lib/apple-signin-migration.mjs';

// The bundle id is the Sign in with Apple client id of a native iOS app, and it
// does not change in a transfer.
const CLIENT_ID = 'com.cultuvilla.app';
const TOKEN_REFRESH_MS = 50 * 60 * 1000;

const FILES = {
  export: 'apple-users.jsonl',
  generate: 'transfer-ids.jsonl',
  exchange: 'new-ids.jsonl',
  relinkBackup: 'relink-backup.jsonl',
  relinkReport: 'relink-report.jsonl',
};

const FLAGS_BY_STEP = {
  export: ['--env', '--dir'],
  generate: ['--team-id', '--key-id', '--key-file', '--target-team-id', '--dir'],
  exchange: ['--team-id', '--key-id', '--key-file', '--dir'],
  relink: ['--env', '--apply', '--dir'],
};

function getArgValue(flag, argv = process.argv) {
  const idx = argv.indexOf(flag);
  if (idx === -1) {
    const eqArg = argv.find((a) => a.startsWith(`${flag}=`));
    return eqArg ? eqArg.slice(flag.length + 1) : null;
  }
  return argv[idx + 1] || null;
}

function assertKnownFlags(known, argv) {
  for (const token of argv) {
    if (token === '--' || !token.startsWith('--')) continue;
    const name = token.includes('=') ? token.slice(0, token.indexOf('=')) : token;
    if (!known.includes(name)) {
      console.error(`Unknown flag: ${name}\nKnown flags: ${known.join(', ')}`);
      process.exit(2);
    }
  }
}

const step = process.argv[2];
if (!FLAGS_BY_STEP[step]) {
  console.error(`Usage: node scripts/admin-apple-signin-migration.mjs <${Object.keys(FLAGS_BY_STEP).join('|')}> [flags]`);
  console.error('Read docs/plans/ongoing/apple-team-transfer.md first.');
  process.exit(2);
}
assertKnownFlags(FLAGS_BY_STEP[step], process.argv.slice(3));

const dir = getArgValue('--dir') || path.join(os.homedir(), 'backups', 'cultuvilla', 'apple-team-transfer');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const fileIn = (name) => path.join(dir, name);
const log = (...args) => console.log(`[apple-signin-migration][${step}]`, ...args);

// ── JSONL ────────────────────────────────────────────────────────────────
function readJsonl(name, { required = true } = {}) {
  const file = fileIn(name);
  if (!fs.existsSync(file)) {
    if (!required) return [];
    console.error(`Missing ${file} — run the previous step first, or pass --dir.`);
    process.exit(2);
  }
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}
const appendJsonl = (name, row) => fs.appendFileSync(fileIn(name), `${JSON.stringify(row)}\n`, { mode: 0o600 });

// ── Apple credentials (generate / exchange) ─────────────────────────────
function appleCredentials() {
  const teamId = getArgValue('--team-id');
  const keyId = getArgValue('--key-id');
  const keyFile = getArgValue('--key-file');
  assertTeamId(teamId, '--team-id');
  if (!keyId || !keyFile) throw new Error('--key-id and --key-file are required');
  return { teamId, keyId, privateKeyPem: fs.readFileSync(keyFile, 'utf8'), clientId: CLIENT_ID };
}

/** A migration token that renews itself before Apple's one-hour expiry. */
function tokenSource(creds) {
  let token = null;
  let fetchedAt = 0;
  return async () => {
    if (!token || Date.now() - fetchedAt > TOKEN_REFRESH_MS) {
      token = await requestMigrationToken(creds);
      fetchedAt = Date.now();
    }
    return token;
  };
}

// ── Firebase (export / relink) ──────────────────────────────────────────
// Imported lazily so generate and exchange — the steps Jaime runs, with no
// Cultuvilla credentials — never touch firebase-admin.
async function firebaseAuth() {
  const env = getArgValue('--env');
  if (!env) {
    console.error('--env=dev|beta|prod is required');
    process.exit(2);
  }
  const { ENVS, resolveEnv, initAdminForEnv } = await import('./lib/env-credentials.mjs');
  // Firebase Auth's admin API refuses a user credential with no quota project.
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT ||= ENVS[resolveEnv(env)].project;
  const { app, projectId } = initAdminForEnv(env);
  log(`project: ${projectId}`);
  return app.auth();
}

// ── Steps ───────────────────────────────────────────────────────────────
async function runExport() {
  const auth = await firebaseAuth();
  const rows = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const row = exportRow(user);
      if (row) rows.push(row);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  fs.writeFileSync(fileIn(FILES.export), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), { mode: 0o600 });
  log(`${rows.length} users with an Apple provider → ${fileIn(FILES.export)}`);
}

async function runGenerate() {
  const creds = appleCredentials();
  const targetTeamId = getArgValue('--target-team-id');
  assertTeamId(targetTeamId, '--target-team-id');
  if (targetTeamId === creds.teamId) throw new Error('--target-team-id is the sending team itself');

  const pending = pendingRows(readJsonl(FILES.export), readJsonl(FILES.generate, { required: false }));
  log(`${pending.length} users still need a transfer id`);
  const token = tokenSource(creds);
  for (const row of pending) {
    const transferSub = await generateTransferSub({ ...creds, accessToken: await token(), sub: row.sub, targetTeamId });
    // Apple: export the transfer id only, never the sending team's sub.
    appendJsonl(FILES.generate, { uid: row.uid, transferSub });
  }
  log(`done — ${readJsonl(FILES.generate).length} transfer ids in ${fileIn(FILES.generate)}`);
}

async function runExchange() {
  const creds = appleCredentials();
  const pending = pendingRows(readJsonl(FILES.generate), readJsonl(FILES.exchange, { required: false }));
  log(`${pending.length} transfer ids still to exchange`);
  const token = tokenSource(creds);
  for (const row of pending) {
    const exchanged = await exchangeTransferSub({ ...creds, accessToken: await token(), transferSub: row.transferSub });
    appendJsonl(FILES.exchange, { uid: row.uid, transferSub: row.transferSub, ...exchanged });
  }
  log(`done — ${readJsonl(FILES.exchange).length} new subs in ${fileIn(FILES.exchange)}`);
}

async function runRelink() {
  const apply = process.argv.includes('--apply');
  const auth = await firebaseAuth();
  log(`mode: ${apply ? 'APPLY (writes ENABLED)' : 'DRY RUN (no writes)'}`);

  // The Apple provider each account had before this tool unlinked it — what a
  // run that died between unlink and link needs to finish.
  const backedUpAppleByUid = new Map(
    readJsonl(FILES.relinkBackup, { required: false }).map((b) => [
      b.uid,
      (b.providerData || []).find((p) => p.providerId === APPLE_PROVIDER_ID) || null,
    ]),
  );

  const { counts, report } = await relinkUsers({
    rows: readJsonl(FILES.exchange),
    auth,
    apply,
    backedUpAppleByUid,
    recordBackup: (entry) => appendJsonl(FILES.relinkBackup, entry),
  });

  fs.writeFileSync(fileIn(FILES.relinkReport), report.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
  log(apply ? 'applied:' : 'would apply:', JSON.stringify(counts));
  log(`per-user report → ${fileIn(FILES.relinkReport)}`);
  const { exitCode, unresolved } = relinkOutcome(counts);
  if (exitCode) {
    console.error(`[apple-signin-migration][relink] UNRESOLVED ${JSON.stringify(unresolved)} — see the report and the plan.`);
    console.error('  conflict: a fresh Apple sign-in created an empty account; merge by hand, then re-run.');
    console.error('  no-apple-provider: the account has no Apple provider and no backup of ours; investigate before re-running.');
  }
  return exitCode;
}

const RUNNERS = { export: runExport, generate: runGenerate, exchange: runExchange, relink: runRelink };

RUNNERS[step]()
  .then((exitCode) => process.exit(exitCode || 0))
  .catch((err) => {
    console.error(`[apple-signin-migration][${step}] FAILED: ${err?.message || err}`);
    console.error('Every step is safe to re-run: it resumes from what is already written.');
    process.exit(1);
  });
