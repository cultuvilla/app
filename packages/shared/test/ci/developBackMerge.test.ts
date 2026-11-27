import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// beta → main merge commits must never reach develop (AGENTS.md § Versioning &
// releases), and scripts/check-develop-back-merge.mjs is what enforces it. It
// is a step of the required `ci` job — so it gates the merge queue too — and
// not a job of its own, which would be a new CI cost line. This fails the
// build if the step is dropped, moved out of that job, or soft-failed.

const repoRoot = resolve(__dirname, '../../../..');
const workflow = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf-8');

function jobBlock(name: string): string {
  const start = workflow.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  if (start < 0) throw new Error(`ci.yml has no job "${name}"`);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][\w-]*:\s*$/m);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

function stepOf(job: string, run: string): string {
  const at = job.indexOf(run);
  if (at < 0) throw new Error(`step running "${run}" missing`);
  const start = job.lastIndexOf('- name:', at);
  const next = job.indexOf('- name:', at);
  return job.slice(start, next < 0 ? undefined : next);
}

const RUN = 'node scripts/check-develop-back-merge.mjs --ci';

describe('develop back-merge guard is wired into CI', () => {
  it('the script exists', () => {
    expect(existsSync(resolve(repoRoot, 'scripts/check-develop-back-merge.mjs'))).toBe(true);
  });

  it('runs as a step of the required ci job, after the checkout', () => {
    const job = jobBlock('ci');
    expect(job).toContain(RUN);
    expect(job.indexOf('actions/checkout')).toBeLessThan(job.indexOf(RUN));
  });

  it('runs on every event the job runs on, merge_group included', () => {
    expect(workflow).toMatch(/^ {2}merge_group:/m);
    const step = stepOf(jobBlock('ci'), RUN);
    expect(step).not.toMatch(/^\s+if:/m);
    expect(step).not.toMatch(/continue-on-error:\s*true/);
  });

  it('is not its own job', () => {
    expect(workflow.split(RUN)).toHaveLength(2);
  });
});
