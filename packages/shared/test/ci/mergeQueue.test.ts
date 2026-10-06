import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// develop requires a merge queue, configured by .github/rulesets/develop.json.
// The queue merges only once every required check reports on the merge group,
// so a required check that never runs there wedges every PR in the queue until
// its 30-minute timeout. These invariants catch that before the ruleset does.
// See docs/decisions/merge-queue.md.

const repoRoot = resolve(__dirname, '../../../..');
const ruleset = JSON.parse(readFileSync(resolve(repoRoot, '.github/rulesets/develop.json'), 'utf8')) as {
  rules: { type: string; parameters: Record<string, unknown> }[];
};
const ciYml = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const triggers = ciYml.slice(0, ciYml.indexOf('\njobs:'));
// One block per job: each starts at a two-space-indented key under `jobs:`.
const jobBlocks = ciYml
  .slice(ciYml.indexOf('\njobs:'))
  .split(/\n(?=  [a-z0-9_-]+:\n)/)
  .slice(1);

const rule = (type: string) => ruleset.rules.find((r) => r.type === type)?.parameters;
const requiredChecks = (
  rule('required_status_checks')?.required_status_checks as { context: string }[]
).map((c) => c.context);

describe('develop merge queue', () => {
  it('CI runs on merge groups', () => {
    expect(triggers).toMatch(/^  merge_group:/m);
  });

  it('every required check is a CI job that runs unconditionally', () => {
    for (const context of requiredChecks) {
      const job = jobBlocks.find((b) => b.includes(`\n    name: ${context}\n`));
      expect(job, `no ci.yml job is named "${context}"`).toBeDefined();
      expect(job, `"${context}" carries an if: and can skip on a merge group`).not.toMatch(/^    if:/m);
    }
  });

  it('the queue keeps one merge commit per PR', () => {
    expect(rule('merge_queue')?.merge_method).toBe('MERGE');
  });
});
