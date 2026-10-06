import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Installed store binaries lag for weeks, so two kinds of change strand them:
// a callable that disappears (check-callable-removal.mjs) and a stored schema
// that changes under their strict converters (check-schema-change.mjs). Both
// are PR-time guards in ci.yml. This invariant fails the build if either is
// unwired, stops running on pull requests, or loses the merge-base fetch that
// lets it read the PR's own commits — without which every multi-commit PR
// would be judged on a range that cannot see its Breaking-Client trailer.
// See docs/decisions/breaking-change-and-hard-wall.md.

const repoRoot = resolve(__dirname, '../../../..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf-8');

function jobBlock(name: string): string {
  const start = workflow.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  if (start < 0) throw new Error(`ci.yml has no job "${name}"`);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][\w-]*:\s*$/m);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

const job = jobBlock('breaking-changes');

describe('breaking-change guards are wired into CI', () => {
  it('runs on pull requests, where a base ref exists', () => {
    expect(workflow).toMatch(/^ {2}pull_request:/m);
    expect(job).toContain("if: github.event_name == 'pull_request'");
  });

  for (const script of ['check-callable-removal.mjs', 'check-schema-change.mjs']) {
    it(`runs ${script} against the PR base`, () => {
      expect(existsSync(resolve(repoRoot, 'scripts', script))).toBe(true);
      expect(job).toMatch(new RegExp(`node scripts/${script.replace('.', '\\.')} --base="origin/\\$\\{BASE_REF\\}"`));
    });

    it(`fetches the merge-base before ${script}`, () => {
      const fetchPos = job.indexOf('scripts/ci-fetch-merge-base.sh');
      expect(fetchPos, 'merge-base fetch missing').toBeGreaterThanOrEqual(0);
      expect(fetchPos).toBeLessThan(job.indexOf(`scripts/${script}`));
    });
  }

  it('is not soft-failed', () => {
    expect(job).not.toMatch(/continue-on-error:\s*true/);
  });
});
