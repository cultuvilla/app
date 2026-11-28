import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_INCLUDE, UNIT_INCLUDE } from '../../vitest.suites';

// The local full gate (`pnpm test`, inside `pnpm check`) must run everything CI
// runs. It drifted twice: the shared all-in-one vitest config lost test/ci and
// test/firestore, and root `pnpm test` never ran the i18n suite — so a change
// could pass locally and go red only in CI. These invariants fail the build if
// either gap reopens.

const repoRoot = resolve(__dirname, '../../../..');
const sharedTestDir = resolve(repoRoot, 'packages/shared/test');
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const ciWorkflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');

function dirsWithTests(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.test.ts'))
    .map((e) => e.parentPath.slice(sharedTestDir.length + 1).split('/')[0] ?? '')
    .filter((d, i, all) => d !== '' && all.indexOf(d) === i);
}

const topLevelDir = (glob: string) => glob.split('/')[1];

describe('shared vitest suites', () => {
  it('every test directory is run by the all-in-one config (local pnpm test)', () => {
    const covered = new Set(ALL_INCLUDE.map(topLevelDir));
    const missing = dirsWithTests(sharedTestDir).filter((d) => !covered.has(d));
    expect(missing).toEqual([]);
  });

  it('the all-in-one config runs every unit glob CI runs', () => {
    expect(UNIT_INCLUDE.filter((g) => !ALL_INCLUDE.includes(g))).toEqual([]);
  });
});

describe('root pnpm test covers CI', () => {
  const test = rootPkg.scripts.test;

  it('runs every workspace suite that CI test:unit runs', () => {
    expect(rootPkg.scripts['test:unit']).toMatch(/i18n:test/);
    expect(test).toMatch(/@cultuvilla\/shared test:all/);
    expect(test).toMatch(/app:test/);
    expect(test).toMatch(/functions run test:all/);
    expect(test).toMatch(/i18n:test/);
  });

  it('runs the repo scripts and the shared agent tooling suites', () => {
    expect(test).toMatch(/scripts:test/);
    expect(test).toMatch(/agents:test/);
    expect(rootPkg.scripts['agents:test']).toContain('.agents/_shared/scripts/__tests__/');
  });

  // A node --test file that never exits (a server left listening, a pending
  // timer) gives no output at all and holds the emulator job to its 25-minute
  // limit, as metro-port.test.mjs did three times on 2026-11-28. A per-test
  // timeout names a hung test; force-exit ends a file whose tests all finished.
  it.each(['scripts:test', 'agents:test'])('%s cannot hang the job', (name) => {
    expect(rootPkg.scripts[name]).toMatch(/--test-timeout=\d+/);
    expect(rootPkg.scripts[name]).toContain('--test-force-exit');
  });

  // agents:test reads .agents/_shared, a committed copy of agent-skills. As a
  // submodule it was empty wherever nobody initialised it, and node --test then
  // matched no files and failed the job.
  it('keeps the shared agent tooling as committed files, not a submodule', () => {
    const job = ciWorkflow.slice(ciWorkflow.indexOf('emulator-tests:'));
    expect(job).toMatch(/run: pnpm test\n/);
    expect(existsSync(resolve(repoRoot, '.gitmodules'))).toBe(false);
    expect(existsSync(resolve(repoRoot, '.agents/_shared/scripts/__tests__'))).toBe(true);
  });
});
