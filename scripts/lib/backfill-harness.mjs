/**
 * IO + orchestration for the backfill registry: discovery, execution,
 * dry-run-by-default, and completion-marker writing. Pure decision logic lives
 * in backfill-registry.mjs; credential resolution in env-credentials.mjs.
 *
 * A registered backfill is a `.mjs` under scripts/ shaped like:
 *
 *   export const meta = { id, kind, description, phase, envs, idempotent, owner, autoApply };
 *   export async function run({ db, admin, FieldValue, env, projectId, apply, dryRun, verbose, log }) {
 *     ...                                   // must honour `apply` (dry run writes nothing)
 *     return { patched, total };            // recorded on the marker
 *   }
 *   if (isMain(import.meta.url)) await runBackfill({ meta, run });
 *
 * DISCOVERY IS SENTINEL-GATED. `loadBackfills` greps for the literal
 * `runBackfill({ meta, run })` call before importing a file. That call sits
 * inside the `isMain(...)` guard, so importing the module for discovery does
 * NOT execute the backfill. A script without the sentinel is never imported —
 * which is what keeps the 20-odd legacy scripts (they connect to Firestore at
 * module scope) from firing during a `backfills:list`.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { initAdminForEnv, resolveEnv } from './env-credentials.mjs';
import { validateMeta, markerPath, ENVS, INFRA_FILES, SCAN_DIRS as SCAN_DIRS_REL, SENTINEL, SENTINEL_RE } from './backfill-registry.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SCAN_DIRS = SCAN_DIRS_REL.map((dir) => path.join(REPO_ROOT, dir));

export { SENTINEL, SENTINEL_RE };

/** True when this module is the process entrypoint (the ESM `require.main === module`). */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return importMetaUrl === pathToFileURL(path.resolve(entry)).href;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const value = (flag) => {
    const hit = argv.find((a) => a === flag || a.startsWith(`${flag}=`));
    if (!hit) return null;
    if (hit === flag) {
      const next = argv[argv.indexOf(hit) + 1];
      return next && !next.startsWith('--') ? next : null;
    }
    return hit.slice(flag.length + 1);
  };
  return {
    env: value('--env'),
    id: value('--id'),
    apply: argv.includes('--apply'),
    confirm: argv.includes('--confirm'),
    verbose: argv.includes('--verbose'),
  };
}

/**
 * beta/prod need explicit `--confirm`, mirroring lib/env-confirm.mjs and the
 * AGENTS.md rule that dev is autonomous while shared envs are not. Applies to
 * WRITES only — `verify` is read-only and resolves its env directly.
 */
export function requireConfirmForSharedEnv(env, confirm) {
  if ((env === 'beta' || env === 'prod') && !confirm) {
    throw new Error(`Refusing to run against ${env} without --confirm. Beta/prod need explicit intent (see AGENTS.md).`);
  }
}

function gitSha() {
  try {
    const sha = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}

function actor() {
  return process.env.GITHUB_ACTOR || process.env.USER || process.env.USERNAME || 'unknown';
}

/**
 * Every registered backfill, sorted by id. Safe to call for listing: only
 * sentinel-carrying files are imported, and the sentinel lives behind isMain().
 */
export async function loadBackfills() {
  const found = [];
  for (const dir of SCAN_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith('.mjs')) continue;
      if (INFRA_FILES.has(name)) continue;
      const file = path.join(dir, name);
      if (!statSync(file).isFile()) continue;
      if (!SENTINEL_RE.test(readFileSync(file, 'utf8'))) continue;
      const mod = await import(pathToFileURL(file).href);
      if (!mod || typeof mod.meta !== 'object' || mod.meta === null) continue;
      validateMeta(mod.meta);
      found.push({ file: path.relative(REPO_ROOT, file), meta: mod.meta, run: mod.run });
    }
  }
  found.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  return found;
}

export async function findBackfillById(id) {
  return (await loadBackfills()).find((b) => b.meta.id === id) || null;
}

/** Read one completion marker, or null. Requires an initialized admin app. */
export async function readMarker(db, id) {
  const snap = await db.doc(markerPath(id)).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Run one backfill against one env. Dry run unless `apply`. On a successful
 * apply (and `kind !== 'audit'`) writes `_admin/backfills/markers/{id}.{env}` —
 * that marker, not a checklist, is what `verify` reads.
 *
 * `run()` is deliberately NOT wrapped in a try/catch: a write failure must
 * crash before the marker is written, so a half-applied backfill never reports
 * itself as done.
 */
export async function executeBackfill({ meta, run }, { env, apply = false, verbose = false }) {
  validateMeta(meta);
  if (typeof run !== 'function') throw new Error(`backfill ${meta.id} must export an async run(ctx)`);
  const alias = resolveEnv(env);
  if (!meta.envs.includes(alias)) {
    throw new Error(`[${meta.id}] does not target env "${alias}" (envs: ${meta.envs.join(', ')})`);
  }

  const { projectId } = initAdminForEnv(alias);
  const db = admin.firestore();
  const log = (...args) => console.log(`[${meta.id}][${alias}]`, ...args);

  log(apply ? 'APPLY — writes ENABLED' : 'DRY RUN — no writes');
  log(`project: ${projectId}`);

  const counts = await run({
    db,
    admin,
    FieldValue: admin.firestore.FieldValue,
    env: alias,
    projectId,
    apply,
    dryRun: !apply,
    verbose,
    log,
  });

  if (apply && meta.kind !== 'audit') {
    await db.doc(markerPath(meta.id)).set(
      {
        [alias]: {
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          gitSha: gitSha(),
          actor: actor(),
          counts: counts ?? null,
        },
      },
      { merge: true },
    );
    log(`marker written: ${markerPath(meta.id)}.${alias}`);
  }
  return counts;
}

/** Entrypoint a registered script calls under `isMain(import.meta.url)`. */
export async function runBackfill({ meta, run }, argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const env = args.env ?? 'dev';
  if (!ENVS.includes(env)) {
    console.error(`Usage: node <script> --env=${ENVS.join('|')} [--apply] [--confirm] [--verbose]`);
    process.exit(2);
  }
  requireConfirmForSharedEnv(env, args.confirm);
  return executeBackfill({ meta, run }, { env, apply: args.apply, verbose: args.verbose });
}
