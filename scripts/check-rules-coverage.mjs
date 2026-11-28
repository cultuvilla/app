#!/usr/bin/env node
// The rules coverage ratchet. After the rules suite has run with
// RULES_COVERAGE_DIR set, every `allow` condition in firestore.rules must have
// been seen by a test both granting and refusing, or be listed with a reason in
// packages/shared/test/e2e/rules-uncovered.json — a list that may only shrink.
//
//   node scripts/check-rules-coverage.mjs <dir>           # check, then remove <dir>
//   node scripts/check-rules-coverage.mjs <dir> --write   # list today's gaps (keeps reasons)
//
// `pnpm --filter @cultuvilla/shared test:rules` (and test:all) run it after vitest.
// See docs/plans/ongoing/rules-coverage-ratchet.md.

import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  check,
  gaps,
  mergeCoverage,
  parseRules,
  readReports,
  readUncovered,
  rulesPath,
  uncoveredPath,
  writeUncovered,
} from './lib/rules-coverage.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const dirArg = args.find((a) => !a.startsWith('--'));
if (!dirArg) {
  console.error('Usage: check-rules-coverage.mjs <coverage dir> [--write]');
  process.exit(2);
}
const dir = resolve(dirArg);

// Fewer files than this means the suite did not really run (a filtered run, a
// crash before the first afterAll), and every condition would read as a gap.
const MIN_REPORTS = 40;

const text = readFileSync(rulesPath, 'utf8');
const conditions = parseRules(text);
const reports = readReports(dir);
rmSync(dir, { recursive: true, force: true });

if (reports.length < MIN_REPORTS) {
  console.error(
    `rules coverage: only ${reports.length} test file report(s) in ${dirArg}; ` +
      `expected the whole rules suite (≥ ${MIN_REPORTS}). Run the full \`test:rules\`.`,
  );
  process.exit(1);
}

const measured = gaps(mergeCoverage(text, conditions, reports));
const listed = readUncovered();

if (write) {
  const next = {};
  for (const [key, gap] of measured) {
    const old = listed[key];
    next[key] = old && old.startsWith(`${gap}:`) ? old : `${gap}: TODO say why no test can`;
  }
  writeUncovered(next);
  console.log(`rules coverage: wrote ${measured.size} gap(s) to ${uncoveredPath}`);
  process.exit(0);
}

const { unlisted, stale, missing, wrongKind } = check(measured, listed, conditions);
const todo = Object.entries(listed).filter(([, r]) => /\bTODO\b/.test(r)).map(([k]) => k);
let failed = false;
const report = (title, lines) => {
  if (lines.length === 0) return;
  failed = true;
  console.error(`\n${title}`);
  for (const l of lines) console.error(`  - ${l}`);
};

report(
  'Conditions no test has seen both grant and refuse — write the test, or list the key in rules-uncovered.json with why:',
  unlisted.map((k) => `${k}  (${measured.get(k)})`),
);
report('Listed gaps a test now covers both ways — delete them from rules-uncovered.json:', stale);
report('Listed keys that no longer exist in firestore.rules — delete them:', missing);
report(
  'Listed reasons that name the wrong gap — update them:',
  wrongKind.map((w) => `${w.key}: listed "${w.reason}", measured ${w.measured}`),
);
report('Listed gaps with no reason yet — replace the TODO with why no test can:', todo);

if (failed) {
  console.error(`\nrules coverage: FAILED (${conditions.length} allow conditions, ${reports.length} test files)`);
  process.exit(1);
}
console.log(
  `rules coverage: ok — ${conditions.length} allow conditions, ${measured.size} listed gap(s), ${reports.length} test files`,
);
