#!/usr/bin/env node
/**
 * Backfill registry CLI.
 *
 *   list                              print the registry (no credentials needed)
 *   verify     --env=<env>            exit 1 if a pre-deploy backfill has no marker
 *   run        --id=<id> --env=<env>  run one backfill (dry run unless --apply)
 *   auto-apply --env=<env>            run every idempotent opted-in backfill
 *
 * `verify` is the deploy gate: it answers "is this env's DATA ready for the
 * code we are about to ship?" the same way check-dev-conformance.mjs answers
 * "does this env's data match the shipped schema?". Both run before the first
 * `firebase deploy` so a missing migration blocks the pipeline rather than
 * crashing reads in production.
 */

import admin from 'firebase-admin';
import { initAdminForEnv, resolveEnv } from './lib/env-credentials.mjs';
import {
  ENVS,
  findMissingMarkers,
  selectAutoApplicable,
  selectPostDeploy,
  selectPreDeploy,
} from './lib/backfill-registry.mjs';
import {
  executeBackfill,
  findBackfillById,
  loadBackfills,
  parseArgs,
  readMarker,
  requireConfirmForSharedEnv,
} from './lib/backfill-harness.mjs';

const USAGE = `Usage:
  node scripts/backfills-cli.mjs list
  node scripts/backfills-cli.mjs verify     --env=${ENVS.join('|')}
  node scripts/backfills-cli.mjs run        --id=<id> --env=${ENVS.join('|')} [--apply] [--confirm] [--verbose]
  node scripts/backfills-cli.mjs auto-apply --env=${ENVS.join('|')} [--phase=post-deploy] [--apply] [--confirm] [--verbose]`;

function requireEnv(args) {
  if (!args.env || !ENVS.includes(args.env)) {
    console.error(`--env is required and must be one of ${ENVS.join('|')}\n\n${USAGE}`);
    process.exit(2);
  }
  return resolveEnv(args.env);
}

async function cmdList() {
  const backfills = await loadBackfills();
  const rows = [
    ['ID', 'KIND', 'PHASE', 'ENVS', 'IDEMPOTENT', 'AUTO-APPLY', 'FILE'],
    ...backfills.map((b) => [
      b.meta.id,
      b.meta.kind,
      b.meta.phase,
      b.meta.envs.join('/'),
      b.meta.idempotent ? 'yes' : 'no',
      (b.meta.autoApply ?? []).join('/') || '—',
      b.file,
    ]),
  ];
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const row of rows) console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd());
  console.log(`\n${backfills.length} backfill(s) registered.`);
}

async function cmdVerify(args) {
  const env = requireEnv(args);
  const metas = (await loadBackfills()).map((b) => b.meta);

  const { projectId } = initAdminForEnv(env);
  const db = admin.firestore();
  const getMarker = (id) => readMarker(db, id);

  // Post-deploy first: loud but NON-blocking. Blocking would deadlock — these
  // cannot run until the deploy they would be blocking has happened.
  const post = selectPostDeploy(metas, env);
  const postMissing = await findMissingMarkers(post, env, getMarker);
  if (postMissing.length > 0) {
    console.warn(`::warning::${postMissing.length} post-deploy backfill(s) pending for ${env} — run them after this deploy:`);
    for (const id of postMissing) {
      console.warn(`   - ${id}: ${post.find((m) => m.id === id).description}`);
    }
  }

  const pre = selectPreDeploy(metas, env);
  const preMissing = await findMissingMarkers(pre, env, getMarker);
  if (preMissing.length > 0) {
    console.error(`\n❌ ${preMissing.length} pre-deploy backfill(s) not yet applied to ${env} (${projectId}):`);
    for (const id of preMissing) {
      console.error(`   - ${id}: ${pre.find((m) => m.id === id).description}`);
    }
    console.error(
      `\nDeploying now would ship code whose converters cannot read this env's data.\n` +
        `Run each one first (Actions → "Run Backfill", or locally):\n` +
        preMissing.map((id) => `   node scripts/backfills-cli.mjs run --id=${id} --env=${env} --confirm --apply`).join('\n'),
    );
    process.exit(1);
  }

  console.log(`✅ all ${pre.length} pre-deploy backfill(s) applied for ${env} (${projectId}).`);
}

async function cmdRun(args) {
  const env = requireEnv(args);
  if (!args.id) {
    console.error(`--id is required. Run \`pnpm backfills:list\` to see ids.\n\n${USAGE}`);
    process.exit(2);
  }
  requireConfirmForSharedEnv(env, args.confirm);
  const backfill = await findBackfillById(args.id);
  if (!backfill) {
    console.error(`No backfill with id "${args.id}". Run \`pnpm backfills:list\` to see ids.`);
    process.exit(2);
  }
  await executeBackfill(backfill, { env, apply: args.apply, verbose: args.verbose });
  if (!args.apply) console.log('\nDry run only — re-run with --apply to write (and record the marker).');
}

/**
 * Run every backfill opted into `autoApply` for this env that has no marker
 * yet. A no-op unless a backfill opts in, and every opted-in backfill is
 * idempotent by validateMeta, so this is safe to call on every deploy. Without
 * `--phase` it is the pass before the deploy (everything but post-deploy);
 * `--phase=post-deploy` is the pass after it.
 */
async function cmdAutoApply(args) {
  const env = requireEnv(args);
  if (args.phase && args.phase !== 'post-deploy') {
    console.error(`--phase must be post-deploy (the pass after the deploy), or omitted.\n\n${USAGE}`);
    process.exit(2);
  }
  requireConfirmForSharedEnv(env, args.confirm);
  const backfills = await loadBackfills();
  const eligible = selectAutoApplicable(backfills.map((b) => b.meta), env, { phase: args.phase ?? undefined });
  if (eligible.length === 0) {
    console.log(`No auto-applicable ${args.phase ?? 'pre-deploy'} backfills for ${env} — nothing to do.`);
    return;
  }

  initAdminForEnv(env);
  const db = admin.firestore();
  for (const meta of eligible) {
    const marker = await readMarker(db, meta.id);
    if (marker && marker[env]) {
      console.log(`✓ ${meta.id} — already applied to ${env}, skipping.`);
      continue;
    }
    console.log(`▶ auto-apply ${meta.id}${args.apply ? '' : ' (DRY RUN)'}`);
    await executeBackfill(backfills.find((b) => b.meta.id === meta.id), {
      env,
      apply: args.apply,
      verbose: args.verbose,
    });
  }
}

const COMMANDS = { list: cmdList, verify: cmdVerify, run: cmdRun, 'auto-apply': cmdAutoApply };

const command = COMMANDS[process.argv[2]];
if (!command) {
  console.error(USAGE);
  process.exit(2);
}
command(parseArgs()).catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
