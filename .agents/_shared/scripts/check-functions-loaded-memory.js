// CI guardrail: the memory a Cloud Functions bundle takes just by loading must
// stay under a budget, so its growth fails a PR instead of killing functions in
// production.
//
//   node scripts/check-functions-loaded-memory.js [--entry=<built entry>] [--runs=3]
//
// Every function of a codebase loads the whole entry before it handles anything,
// and what is left of its memory limit is all a handler has to work in. In
// October 2026 one top-level `@google-cloud/pubsub` import in Órdago took ~17 MiB
// of that; a 256 MiB trigger started dying seconds in, and 45 of 47 runs were lost
// over 16 days before anyone noticed. Nothing checked the loaded size, so nothing
// failed when it grew.
//
// The probe loads the entry the way production does — NODE_ENV, VITEST and
// FUNCTIONS_EMULATOR unset, a project id present — waits for start-up work to
// settle, runs gc() and reads RSS. Median of several runs, since one run varies by
// about a megabyte. The figure depends on the host (Órdago's CI runner read 178 MiB
// where a workstation read 185, and production reads ~25-30 MiB above either), so
// the budget is the CI runner's RSS — the gate runs there — plus headroom.
//
// Config (`.agents/checks.config.json`):
//   "functionsLoadedMemory": {
//     "entry": "functions/lib/index.js",   // the built entry, relative to the repo
//     "budgetMib": 188,                    // required: CI-runner RSS + headroom
//     "build": "pnpm --filter functions build"  // printed when the entry is missing
//   }
//
// Over budget: make the new heavy dependency load on first use (a `require`
// inside the function that needs it), or, if the growth is wanted, raise
// `budgetMib` in the same PR and say in it what the extra megabytes buy.

'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { repoRoot, checksConfig, arg } = require('./lib/checks-config');

const DEFAULT_ENTRY = path.join('functions', 'lib', 'index.js');
const DEFAULT_RUNS = 3;
const SETTLE_MS = 1000;
const PROBE_TIMEOUT_MS = 60_000;
const MIB = 1024 * 1024;

const PROBE = `
const entry = process.argv[1];
require(entry);
setTimeout(() => {
  globalThis.gc();
  globalThis.gc();
  const m = process.memoryUsage();
  process.stdout.write('\\n__PROBE__' + JSON.stringify({ rss: m.rss, heapUsed: m.heapUsed }) + '\\n');
  process.exit(0);
}, ${SETTLE_MS});
`;

/** The environment production loads under: the SDK starts, the test and emulator switches are off. */
function probeEnv(env) {
  const out = { ...env };
  delete out.NODE_ENV;
  delete out.VITEST;
  delete out.FUNCTIONS_EMULATOR;
  if (!out.GCLOUD_PROJECT) out.GCLOUD_PROJECT = 'functions-memory-probe';
  return out;
}

function measureOnce(entry) {
  const r = spawnSync(process.execPath, ['--expose-gc', '-e', PROBE, entry], {
    cwd: path.dirname(entry),
    env: probeEnv(process.env),
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
  });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('__PROBE__'));
  if (r.status !== 0 || !line) {
    throw new Error(`loading ${entry} failed (exit ${r.status}, signal ${r.signal}):\n${(r.stderr || '').slice(-2000)}`);
  }
  return JSON.parse(line.slice('__PROBE__'.length));
}

function median(values) {
  if (values.length === 0) throw new Error('median of no values');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function measure(entry, runs) {
  const samples = Array.from({ length: runs }, () => measureOnce(entry));
  return {
    samples,
    rssMib: median(samples.map((s) => s.rss)) / MIB,
    heapUsedMib: median(samples.map((s) => s.heapUsed)) / MIB,
  };
}

function verdict(rssMib, budgetMib) {
  return { ok: rssMib <= budgetMib, headroomMib: budgetMib - rssMib };
}

function main(argv = process.argv.slice(2)) {
  const root = repoRoot();
  const cfg = checksConfig(root, 'functionsLoadedMemory');
  const budget = cfg.budgetMib;
  if (typeof budget !== 'number' || !(budget > 0)) {
    console.error('check-functions-loaded-memory: set "functionsLoadedMemory.budgetMib" in .agents/checks.config.json');
    return 2;
  }
  const entry = path.resolve(root, arg(argv, '--entry', cfg.entry ?? DEFAULT_ENTRY));
  const runs = Number(arg(argv, '--runs', DEFAULT_RUNS));
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${runs}`);
  if (!fs.existsSync(entry)) {
    console.error(`${entry} does not exist — build it first${cfg.build ? `: ${cfg.build}` : ''}`);
    return 2;
  }

  const { samples, rssMib, heapUsedMib } = measure(entry, runs);
  const { ok, headroomMib } = verdict(rssMib, budget);
  const runsText = samples.map((s) => (s.rss / MIB).toFixed(1)).join(', ');
  const report =
    `functions loaded memory: RSS ${rssMib.toFixed(1)} MiB (median of ${runsText}), heap ${heapUsedMib.toFixed(1)} MiB; ` +
    `budget ${budget} MiB, ${ok ? 'headroom' : 'OVER by'} ${Math.abs(headroomMib).toFixed(1)} MiB`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  if (!ok) {
    console.error(
      'Every function loads this before it handles anything. Load the new heavy dependency on first use, ' +
        'or raise functionsLoadedMemory.budgetMib in .agents/checks.config.json and say in the PR what it buys.',
    );
    return 1;
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { probeEnv, median, measure, verdict, main };
