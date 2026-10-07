import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// promote-to-main.yml opens the `beta → main` PR and, once the user turns on
// AUTO_MERGE_TO_MAIN (approved 2026-10-07), merges it. Merging main ships
// production, so the pieces that keep that safe are pinned here; the decision
// itself is unit-tested in scripts/__tests__/auto-promote-main.test.mjs.

const repoRoot = resolve(__dirname, '../../../..');
const wf = readFileSync(resolve(repoRoot, '.github/workflows/promote-to-main.yml'), 'utf8');
const decider = readFileSync(resolve(repoRoot, 'scripts/auto-promote-main.mjs'), 'utf8');

function job(name: string): string {
  const start = wf.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name} missing`).toBeGreaterThan(-1);
  const next = wf.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? wf.slice(start) : wf.slice(start, start + 1 + next);
}

function step(jobText: string, name: string): string {
  const start = jobText.indexOf(`- name: ${name}`);
  expect(start, `step ${name} missing`).toBeGreaterThan(-1);
  const next = jobText.slice(start + 1).search(/\n {6}- /);
  return next === -1 ? jobText.slice(start) : jobText.slice(start, start + 1 + next);
}

describe('promote-to-main auto-merge', () => {
  const autoMerge = job('auto-merge');
  const merge = step(autoMerge, 'Merge the promotion PR');

  it('re-evaluates on a schedule and when android-e2e finishes on beta', () => {
    const triggers = wf.slice(wf.indexOf('\non:'), wf.indexOf('\npermissions:'));
    expect(triggers).toMatch(/schedule:\s*\n\s*- cron:/);
    expect(triggers).toContain('"android-e2e"');
    // open-pr must not react to the E2E trigger or to the schedule.
    expect(job('open-pr')).toContain("github.event_name == 'workflow_run'");
    expect(job('open-pr')).toContain("github.event.workflow_run.name != 'android-e2e'");
  });

  // A push made with GITHUB_TOKEN triggers no workflow: Deploy prod and
  // Production release would never run after the merge.
  it('merges with RELEASE_PR_TOKEN only, never GITHUB_TOKEN', () => {
    expect(merge).toMatch(/GH_TOKEN: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}\n/);
    expect(merge).not.toContain('github.token');
    expect(merge).not.toContain('GITHUB_TOKEN }}');
    expect(merge).toContain('gh pr merge');
    expect(merge).toContain('--merge');
    expect(merge).toContain('--match-head-commit');
  });

  it('is the only step that merges', () => {
    expect(wf.match(/gh pr merge/g)).toHaveLength(1);
  });

  // GitHub's default message; a [skip-deploy|store|ota] there would stop prod.
  it('leaves the merge commit message to GitHub', () => {
    expect(merge).not.toMatch(/--(subject|body|body-file)\b/);
    expect(merge).not.toMatch(/-[tb] /);
  });

  it('merges only on the decider saying so', () => {
    expect(merge).toContain("if: steps.decide.outputs.action == 'merge'");
    expect(autoMerge).toContain('node scripts/auto-promote-main.mjs');
  });

  it('is off unless AUTO_MERGE_TO_MAIN is exactly true', () => {
    expect(autoMerge).toContain('AUTO_MERGE_TO_MAIN: ${{ vars.AUTO_MERGE_TO_MAIN }}');
    expect(autoMerge).toContain(`[ "$AUTO_MERGE_TO_MAIN" = 'true' ] && enabled=true`);
    expect(autoMerge).toMatch(/enabled=false;/);
    expect(decider).toMatch(/if \(!input\.enabled\)/);
  });

  it('warns when RELEASE_PR_TOKEN is absent and never merges without it', () => {
    expect(autoMerge).toContain("HAS_RELEASE_PR_TOKEN: ${{ secrets.RELEASE_PR_TOKEN != '' }}");
    expect(autoMerge).toContain('::warning::RELEASE_PR_TOKEN is not set');
    expect(decider).toMatch(/if \(!input\.hasToken\)/);
  });

  it('reads the soak from AUTO_PROMOTE_SOAK_HOURS, default 2', () => {
    expect(autoMerge).toContain('AUTO_PROMOTE_SOAK_HOURS: ${{ vars.AUTO_PROMOTE_SOAK_HOURS }}');
    expect(decider).toContain('DEFAULT_SOAK_HOURS = 2');
  });

  it('stops on a hold label', () => {
    expect(autoMerge).toContain('labels');
    expect(decider).toContain("HOLD_LABEL = 'hold'");
  });

  it('requires android-e2e and the beta deploy green on the beta commit', () => {
    expect(autoMerge).toContain('event=push&branch=beta');
    expect(decider).toContain("'android-e2e'");
    expect(decider).toContain("'Deploy beta'");
    // The workflow name the decider looks for must be the real one.
    const e2e = readFileSync(resolve(repoRoot, '.github/workflows/android-e2e.yml'), 'utf8');
    expect(e2e).toMatch(/^name: android-e2e$/m);
    expect(e2e).toMatch(/push:\s*\n\s*branches: \[beta, main\]/);
  });

  // A failed open-pr can leave the PR titled and described as the last release.
  it('does not run after open-pr failed, and checks the title is the head version', () => {
    expect(autoMerge).toContain("needs.open-pr.result != 'failure'");
    expect(autoMerge).toContain('apps/mobile/package.json?ref=$sha');
    expect(decider).toContain('input.headVersion');
  });

  it('waits on branch protection via mergeStateStatus', () => {
    expect(autoMerge).toContain('mergeStateStatus');
    expect(decider).toContain("MERGE_READY_STATES = ['CLEAN', 'HAS_HOOKS']");
  });

  it("checks main's required status checks on the head SHA", () => {
    expect(autoMerge).toContain('.protection.required_status_checks.contexts');
    expect(autoMerge).toContain('rules/branches/main');
    expect(autoMerge).toContain('/check-runs');
  });
});
