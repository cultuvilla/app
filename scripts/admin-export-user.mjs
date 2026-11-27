#!/usr/bin/env node
/**
 * Export everything Cultuvilla holds about one account, as one JSON file — the
 * answer to an emailed access or portability request (RGPD art. 15/20).
 * Runbook: docs/ops/data-access-and-deletion-requests.md.
 *
 * The list of sources is the account-deletion registry (`UID_CASCADE` in
 * functions/src/account/cascade/registry.ts), read through
 * scripts/lib/user-data-export.mjs. Reads only: the Firestore handle refuses
 * every bulk write, and nothing here calls a document write.
 *
 * USAGE
 *   pnpm admin:export-user --uid=<uid> --env=dev|beta|prod [--out-dir=<dir>]
 *
 * The file is written outside the repo (default: <tmpdir>/cultuvilla-data-exports,
 * mode 600). It is personal data: send it to the requester and delete it.
 * A prod run is Álvaro's, per request.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { resolveDefaultBucket } from './lib/storage-bucket.mjs';
import { loadUidCascade } from './lib/uid-cascade.mjs';
import { adminReader, assertUid, collectUserData, exportFileName, planExport, summarize } from './lib/user-data-export.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const FLAGS = new Set(['--uid', '--env', '--out-dir']);
const USAGE = 'Usage: pnpm admin:export-user --uid=<uid> --env=dev|beta|prod [--out-dir=<dir>]';

export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const [flag, ...rest] = arg.split('=');
    if (!FLAGS.has(flag) || rest.length === 0) throw new Error(`Unknown argument ${JSON.stringify(arg)}. ${USAGE}`);
    args[flag.slice(2)] = rest.join('=');
  }
  if (!args.uid || !args.env) throw new Error(USAGE);
  if (!['dev', 'beta', 'prod'].includes(args.env)) throw new Error(`--env must be dev, beta or prod. ${USAGE}`);
  assertUid(args.uid);
  const outDir = path.resolve(args['out-dir'] ?? path.join(os.tmpdir(), 'cultuvilla-data-exports'));
  const relative = path.relative(REPO_ROOT, outDir);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error(`--out-dir ${outDir} is inside the repo: an export is personal data and must never be committed.`);
  }
  return { uid: args.uid, env: args.env, outDir };
}

/** The Auth record's own fields: who the account is and how it signs in. */
async function authRecord(auth, uid) {
  try {
    const user = await auth.getUser(uid);
    return {
      uid: user.uid,
      email: user.email ?? null,
      emailVerified: user.emailVerified,
      displayName: user.displayName ?? null,
      phoneNumber: user.phoneNumber ?? null,
      photoURL: user.photoURL ?? null,
      providers: user.providerData.map((p) => ({ providerId: p.providerId, email: p.email ?? null })),
      createdAt: user.metadata.creationTime,
      lastSignInAt: user.metadata.lastSignInTime,
    };
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

async function main() {
  const { uid, env, outDir } = parseArgs(process.argv.slice(2));
  const { app, projectId } = initAdminForEnv(env);
  const { UID_CASCADE, COLLECTIONS } = await loadUidCascade();
  const plan = planExport(UID_CASCADE, COLLECTIONS);
  const bucket = await resolveDefaultBucket(app, projectId);
  const bundle = await collectUserData(uid, plan, adminReader(app.firestore(), bucket));
  const auth = await authRecord(app.auth(), uid);

  const exportedAt = new Date();
  const file = path.join(outDir, exportFileName(env, uid, exportedAt));
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify({ exportedAt: exportedAt.toISOString(), project: projectId, auth, ...bundle }, null, 2), { mode: 0o600 });

  console.log(JSON.stringify({ auth: auth ? 1 : 0, ...summarize(bundle) }, null, 2));
  console.log(`Export: ${file}\nPersonal data — review it, send it to the requester, then delete it.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n❌ ${err?.message ?? err}`);
    process.exit(1);
  });
}
