#!/usr/bin/env node
/**
 * audit-firestore-schemas.mjs — the weekly schema audit. READ-ONLY.
 *
 * The conformance gate (check-dev-conformance.mjs) runs only when a promotion
 * deploys. Data drifts between deploys too — an old binary writing a field the
 * schema dropped, a console edit, a function writing past its converter — and
 * nothing noticed until the next promotion blocked on it. This walks one env
 * with the same walker (scripts/lib/conformance-walk.mjs) and the converters of
 * the branch it runs on, and applies audit-firestore-schemas-policy.mjs:
 * schema drift fails closed unless allowlisted with a reason; unmodeled fields
 * fail when not in the committed baseline, which may only shrink.
 *
 * Runs weekly on beta and main from .github/workflows/firestore-schema-audit.yml
 * (keyless, WIF). Ported from ordago-apps' audit-firestore-schemas.js +
 * check-firestore-audit.js, without its scheduled scanner function: here CI scans.
 *
 * USAGE
 *   pnpm shared:build
 *   env -u GOOGLE_APPLICATION_CREDENTIALS node scripts/audit-firestore-schemas.mjs --env=beta
 *     [--out=summary.json] [--report=report.md]
 *     [--update-baseline]   drop baselined signatures no longer seen (never adds)
 *     [--seed-baseline]     record this env's signatures when it has none yet
 *
 * Exits 1 on any failure, 2 on bad usage or a malformed allowlist/baseline.
 */

import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import admin from 'firebase-admin';
import { initAdminForEnv } from './lib/env-credentials.mjs';
import { walkConformance } from './lib/conformance-walk.mjs';
import {
  ALLOWLIST_PATH,
  AUDIT_ENVS,
  BASELINE_PATH,
  evaluate,
  readJson,
  renderReport,
  shrinkBaseline,
  validateAllowlist,
  validateBaseline,
} from './audit-firestore-schemas-policy.mjs';

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const flag = (name) => process.argv.includes(`--${name}`);

const env = arg('env');
if (!AUDIT_ENVS.includes(env)) {
  console.error(`Usage: audit-firestore-schemas.mjs --env=${AUDIT_ENVS.join('|')} [--out=] [--report=] [--update-baseline] [--seed-baseline]`);
  process.exit(2);
}

const allowlist = readJson(ALLOWLIST_PATH);
const baseline = readJson(BASELINE_PATH);
const malformed = [...validateAllowlist(allowlist), ...validateBaseline(baseline)];
if (malformed.length) {
  for (const e of malformed) console.error(`✗ ${e}`);
  process.exit(2);
}

const { projectId } = initAdminForEnv(env);
const { conformanceTargets, collectionPaths } = await import('@cultuvilla/shared/firebase/refs/admin');
console.log(`Schema audit: ${env} (${projectId}) — ${conformanceTargets.length} collections\n`);

const walk = await walkConformance(admin.firestore(), { targets: conformanceTargets, collectionPaths });
let gitSha = process.env.GITHUB_SHA;
if (!gitSha) {
  try {
    gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    gitSha = undefined;
  }
}
const result = {
  env,
  projectId,
  generatedAt: new Date().toISOString(),
  gitSha,
  targets: walk.targets,
  orphans: walk.orphans,
  unmatched: walk.unmatched,
  undeclared: walk.undeclared,
  unmodeled: Object.fromEntries([...walk.unmodeled].sort(([a], [b]) => a.localeCompare(b))),
};
if (arg('out')) writeFileSync(arg('out'), `${JSON.stringify(result, null, 2)}\n`);

if (flag('seed-baseline')) {
  if ((baseline[env] ?? []).length > 0) {
    console.error(`✗ --seed-baseline: ${env} already has a baseline; it may only shrink (--update-baseline).`);
    process.exit(2);
  }
  baseline[env] = Object.keys(result.unmodeled);
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Seeded ${baseline[env].length} unmodeled signature(s) for ${env}.`);
} else if (flag('update-baseline')) {
  const next = shrinkBaseline(baseline, env, Object.keys(result.unmodeled));
  const dropped = (baseline[env] ?? []).length - next[env].length;
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  Object.assign(baseline, next);
  console.log(`Baseline for ${env}: dropped ${dropped} signature(s) no longer seen.`);
}

const verdict = evaluate({ env, result, allowlist, baseline });
const report = renderReport({ env, result, verdict });
if (arg('report')) writeFileSync(arg('report'), report);
console.log(report);
process.exit(verdict.failures.length === 0 ? 0 : 1);
