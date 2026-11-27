// Run with: node --test scripts/__tests__/check-functions-loaded-memory.test.mjs
//
// The probe is driven against fixtures whose loaded size is known, and the CLI
// from a throwaway repo whose .agents/checks.config.json sets the budget.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '../check-functions-loaded-memory.js');
const require = createRequire(import.meta.url);
const { probeEnv, median, measure, verdict } = require(SCRIPT);
const BUDGET_MIB = 200;

/** A git repo whose checks config sets `section`, to run the CLI from. */
function repo(section = { budgetMib: BUDGET_MIB, build: 'make functions' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loaded-memory-repo-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'checks.config.json'), JSON.stringify({ functionsLoadedMemory: section }));
  return dir;
}
const cli = (args, opts = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: repo(), ...opts });

function fixture(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loaded-memory-'));
  const file = path.join(dir, 'entry.js');
  fs.writeFileSync(file, source);
  return file;
}

test('the probe environment is production: test and emulator switches off, a project id set', () => {
  const env = probeEnv({ NODE_ENV: 'test', VITEST: 'true', FUNCTIONS_EMULATOR: 'true', PATH: '/bin' });
  assert.equal(env.NODE_ENV, undefined);
  assert.equal(env.VITEST, undefined);
  assert.equal(env.FUNCTIONS_EMULATOR, undefined);
  assert.equal(env.PATH, '/bin');
  assert.ok(env.GCLOUD_PROJECT);
  assert.equal(probeEnv({ GCLOUD_PROJECT: 'p' }).GCLOUD_PROJECT, 'p');
});

test('median takes the middle sample, and the mean of the middle two', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.throws(() => median([]));
});

test('verdict passes at the budget and fails above it', () => {
  assert.deepEqual(verdict(195, 195), { ok: true, headroomMib: 0 });
  assert.equal(verdict(195.1, 195).ok, false);
  assert.ok(verdict(150, 195).headroomMib > 0);
});

test('the probe reads what loading the entry retains, after gc()', () => {
  const small = measure(fixture('module.exports = 1;'), 1).rssMib;
  const big = measure(fixture('globalThis.kept = Buffer.alloc(64 * 1024 * 1024, 1);'), 1).rssMib;
  assert.ok(big - small >= 60, `expected ~64 MiB more, got ${small.toFixed(1)} → ${big.toFixed(1)}`);
  const freed = measure(fixture('Buffer.alloc(64 * 1024 * 1024, 1);'), 1).rssMib;
  assert.ok(freed < big - 30, `garbage should not count: ${freed.toFixed(1)} vs ${big.toFixed(1)}`);
});

test('the probe loads under the production environment', () => {
  const entry = fixture('if (process.env.NODE_ENV === "test" || process.env.VITEST) throw new Error("test env leaked");');
  assert.doesNotThrow(() => measure(entry, 1));
});

test('a failing entry is an error, not a measurement', () => {
  assert.throws(() => measure(fixture('throw new Error("boom");'), 1), /boom/);
});

test('the CLI exits 1 over the budget and 0 under it', () => {
  const over = fixture(`globalThis.kept = Buffer.alloc(${BUDGET_MIB + 10} * 1024 * 1024, 1);`);
  const env = { ...process.env, GITHUB_STEP_SUMMARY: '' };
  const r = cli([`--entry=${over}`, '--runs=1'], { env });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /OVER by/);
  const ok = cli([`--entry=${fixture('module.exports = 1;')}`, '--runs=1'], { env });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
});

test('the CLI exits 2 when the entry was never built', () => {
  const r = cli(['--entry=/nonexistent/index.js']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /build it first: make functions/);
});

test('the CLI exits 2 when the repo sets no budget, rather than guess one', () => {
  for (const section of [{}, { budgetMib: 0 }, { budgetMib: '188' }]) {
    const r = spawnSync(process.execPath, [SCRIPT, `--entry=${fixture('module.exports = 1;')}`], { encoding: 'utf8', cwd: repo(section) });
    assert.equal(r.status, 2, JSON.stringify(section));
    assert.match(r.stderr, /budgetMib/);
  }
});

test('the entry defaults to the configured path, relative to the repo root', () => {
  const dir = repo({ budgetMib: BUDGET_MIB, entry: 'fn/dist/index.js' });
  fs.mkdirSync(path.join(dir, 'fn', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'fn', 'dist', 'index.js'), 'module.exports = 1;');
  const r = spawnSync(process.execPath, [SCRIPT, '--runs=1'], { encoding: 'utf8', cwd: path.join(dir, 'fn') });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /headroom/);
});

test('the CLI refuses a run count that is not a positive integer', () => {
  const entry = fixture('module.exports = 1;');
  for (const runs of ['0', '-1', '1.5', 'many']) {
    const r = cli([`--entry=${entry}`, `--runs=${runs}`]);
    assert.notEqual(r.status, 0, `--runs=${runs} was accepted`);
    assert.match(r.stderr, /--runs must be a positive integer/);
  }
});

test('the CLI writes its report to the step summary, under budget and over it', () => {
  const cases = [
    { source: 'module.exports = 1;', status: 0, pattern: /headroom/ },
    { source: `globalThis.kept = Buffer.alloc(${BUDGET_MIB + 10} * 1024 * 1024, 1);`, status: 1, pattern: /OVER by/ },
  ];
  for (const { source, status, pattern } of cases) {
    const summary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loaded-memory-summary-')), 'summary.md');
    const env = { ...process.env, GITHUB_STEP_SUMMARY: summary };
    const r = cli([`--entry=${fixture(source)}`, '--runs=1'], { env });
    assert.equal(r.status, status, r.stdout + r.stderr);
    assert.match(fs.readFileSync(summary, 'utf8'), pattern);
  }
});
