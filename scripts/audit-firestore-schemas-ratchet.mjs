#!/usr/bin/env node
/**
 * audit-firestore-schemas-ratchet.mjs — the PR check that keeps the
 * unmodeled-field baseline shrinking. Dependency-free: runs in CI's
 * breaking-changes job, which installs nothing.
 *
 *   node scripts/audit-firestore-schemas-ratchet.mjs --base=origin/develop
 *
 * Fails when the baseline gains a signature the base did not have, or when the
 * baseline or allowlist is malformed (an allowlist entry needs a reason). A new
 * unmodeled field is fixed by modeling it in the schema or removing it from the
 * data — or, when it must stay, by an allowlist entry that says why.
 * Ported from ordago-apps' firestore-audit ratchet.
 */

import { execFileSync } from 'node:child_process';
import {
  ALLOWLIST_PATH,
  BASELINE_PATH,
  BASELINE_REPO_PATH,
  ratchetGrowth,
  readJson,
  validateAllowlist,
  validateBaseline,
} from './audit-firestore-schemas-policy.mjs';

const baseArg = process.argv.find((a) => a.startsWith('--base='));
if (!baseArg) {
  console.error('Usage: audit-firestore-schemas-ratchet.mjs --base=<git ref>');
  process.exit(2);
}
const base = baseArg.slice('--base='.length);

const head = readJson(BASELINE_PATH);
const errors = [...validateAllowlist(readJson(ALLOWLIST_PATH)), ...validateBaseline(head)];

let baseBaseline = null;
try {
  baseBaseline = JSON.parse(execFileSync('git', ['show', `${base}:${BASELINE_REPO_PATH}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  console.log(`No baseline at ${base} — first recording, nothing to ratchet against.`);
}
for (const s of ratchetGrowth(baseBaseline, head)) {
  errors.push(`baseline grew: ${s} — model the field or remove it from the data; an accepted residual goes in the allowlist with a reason`);
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log('Schema-audit baseline and allowlist OK — the baseline did not grow.');
