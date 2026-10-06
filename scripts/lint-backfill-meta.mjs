#!/usr/bin/env node
/**
 * WARN-ONLY lints for the backfill registry. Two checks, both advisory:
 *
 * 1. COVERAGE — scripts that look like backfills but have not opted into the
 *    harness, so they are invisible to `backfills:list` and to the deploy gate.
 * 2. AUTO-APPLY — registered `pre-deploy` backfills that are idempotent but
 *    have not opted into `autoApply`. These are the ones the deploy could
 *    apply itself; leaving them manual is what turns a promotion into "merge,
 *    watch the deploy fail, dispatch N workflow runs, re-run the deploy". The
 *    0.21.0 release did that dance twelve times for six additive migrations.
 *    Opting out is fine — it just has to be a decision, not an oversight.
 *
 * Emits GitHub Actions `::warning::` annotations and ALWAYS exits 0. This repo
 * has ~25 legacy backfill scripts and failing CI on all of them would just get
 * the check disabled.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBackfills } from './lib/backfill-harness.mjs';
import { SCAN_DIRS, SENTINEL, SENTINEL_RE, looksLikeBackfill } from './lib/backfill-registry.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const uncovered = [];
for (const rel of SCAN_DIRS) {
  const dir = path.join(REPO_ROOT, rel);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).sort()) {
    if (!looksLikeBackfill(`${rel}/${name}`)) continue;
    const file = path.join(dir, name);
    if (!statSync(file).isFile()) continue;
    if (SENTINEL_RE.test(readFileSync(file, 'utf8'))) continue;
    uncovered.push(path.relative(REPO_ROOT, file));
  }
}

if (uncovered.length === 0) {
  console.log('✅ backfill registry: every backfill/migration/cleanup script is on the harness.');
} else {
  for (const file of uncovered) {
    console.log(
      `::warning file=${file}::Not on the backfill registry — export \`meta\`/\`run\` and call \`${SENTINEL}\` ` +
        `so it appears in \`pnpm backfills:list\` and the deploy gate can verify it.`,
    );
  }
  console.log(`\n⚠️  ${uncovered.length} script(s) not on the backfill registry (warning only, not a failure):`);
  for (const file of uncovered) console.log(`   - ${file}`);
}

// Check 2 — registered, pre-deploy, idempotent, but not auto-applied. Discovery
// is sentinel-gated, so importing these does not run them.
const registered = await loadBackfills();
const manual = registered.filter(
  (b) => b.meta.phase === 'pre-deploy' && b.meta.idempotent === true && (b.meta.autoApply ?? []).length === 0,
);

if (manual.length === 0) {
  console.log('✅ backfill registry: every idempotent pre-deploy backfill opts into autoApply.');
  process.exit(0);
}

for (const { meta, file } of manual) {
  console.log(
    `::warning file=${file}::\`${meta.id}\` is pre-deploy and idempotent but autoApply is empty, so every promotion ` +
      `blocks on a human running it. Prefer \`autoApply: ${JSON.stringify(meta.envs)}\` unless it genuinely needs ` +
      `judgement — and add \`dependsOn\` if it must follow another backfill.`,
  );
}
console.log(`\n⚠️  ${manual.length} idempotent pre-deploy backfill(s) not auto-applied (warning only, not a failure):`);
for (const { meta } of manual) console.log(`   - ${meta.id}`);
process.exit(0);
