// Tests for scripts/check-workflow-input-injection.js, run against throwaway repos.
// They pin what makes the gate worth having: an attacker-controllable value in a
// `run:` (or github-script) fails, the same value through `env:` passes, the
// baseline only shrinks, and a file the reader cannot parse FAILS — a security
// gate that skipped what it could not read would pass the file holding the hole.
//
// Run with: node --test scripts/__tests__/check-workflow-input-injection.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-workflow-input-injection.js');

function repo(workflows, { baseline, config } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-injection-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const dir = path.join(root, config?.workflowsDir ?? '.github/workflows');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(workflows)) fs.writeFileSync(path.join(dir, name), body);
  if (config) {
    fs.mkdirSync(path.join(root, '.agents'));
    fs.writeFileSync(path.join(root, '.agents/checks.config.json'), JSON.stringify({ workflowInjection: config }));
  }
  if (baseline) {
    const file = path.join(root, config?.baseline ?? '.github/workflow-injection-baseline.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ accepted: baseline }));
  }
  return root;
}
const check = (root, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });

const wf = (stepBody) => `on:
  workflow_dispatch:
    inputs:
      id: { type: string }
jobs:
  backfill:
    runs-on: ubuntu-latest
    steps:
${stepBody}`;

const interpolated = wf(`      - name: Summary
        run: echo "ran \${{ inputs.id }}" >> "$GITHUB_STEP_SUMMARY"
`);
const viaEnv = wf(`      - name: Summary
        env:
          ID: \${{ inputs.id }}
        run: echo "ran $ID" >> "$GITHUB_STEP_SUMMARY"
`);

test('an input interpolated into run: fails, naming the file, job and step', () => {
  const r = check(repo({ 'run-backfill.yml': interpolated }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /run-backfill\.yml → backfill → Summary/);
  assert.match(r.stderr, /\$\{\{ inputs\.id \}\}/);
});

test('the same input bound through env: passes', () => {
  const r = check(repo({ 'run-backfill.yml': viaEnv }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 workflow files OK \(0 baselined\)/);
});

test('every untrusted context is caught; secrets, matrix and vars are not', () => {
  const lines = [
    'github.event.inputs.x', 'inputs.x', 'github.event.issue.title', 'github.event.pull_request.title',
    'github.event.comment.body', 'github.event.review.body', 'github.head_ref',
    'github.event.head_commit.message', 'github.event.workflow_run.head_branch',
  ].map((ctx) => `          echo "\${{ ${ctx} }}"`);
  const trusted = ['secrets.TOKEN', 'matrix.os', 'vars.PROJECT', 'github.sha'].map((ctx) => `          echo "\${{ ${ctx} }}"`);
  const r = check(repo({ 'a.yml': wf(`      - run: |\n${[...lines, ...trusted].join('\n')}\n`) }));
  assert.equal(r.status, 1);
  assert.equal((r.stderr.match(/a\.yml → backfill/g) ?? []).length, lines.length, r.stderr);
  assert.doesNotMatch(r.stderr, /secrets\.|matrix\.|vars\.|github\.sha/);
});

test('an input inside format(), whose braces end before the expression does, is caught', () => {
  const r = check(repo({ 'a.yml': wf(`      - run: tool \${{ inputs.v != '' && format('--v={0}', inputs.v) || '' }}\n`) }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /format\('--v=\{0\}', inputs\.v\) \|\| '' \}\}/);
});

test('a name that merely ends in "inputs" is not an input', () => {
  const r = check(repo({ 'a.yml': wf(`      - run: echo \${{ needs.plan.outputs.inputs }} \${{ steps.x.outputs.my-inputs }}\n`) }));
  assert.equal(r.status, 0, r.stderr);
});

test('an actions/github-script script is code too', () => {
  const r = check(repo({ 'a.yml': wf(`      - uses: actions/github-script@v7
        with:
          script: core.info('\${{ github.event.issue.title }}')
`) }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /github\.event\.issue\.title/);
});

test('an interpolation outside run: (if:, with:, env:) is not flagged', () => {
  const r = check(repo({ 'a.yml': wf(`      - if: \${{ inputs.id != '' }}
        uses: actions/checkout@v4
        with:
          ref: \${{ inputs.id }}
`) }));
  assert.equal(r.status, 0, r.stderr);
});

test('a baselined site passes; a stale entry fails; reasons are accepted', () => {
  const site = 'run-backfill.yml|backfill|${{ inputs.id }}';
  assert.equal(check(repo({ 'run-backfill.yml': interpolated }, { baseline: [{ key: site, reason: 'validated upstream' }] })).status, 0);
  assert.equal(check(repo({ 'run-backfill.yml': interpolated }, { baseline: [site] })).status, 0);
  const stale = check(repo({ 'run-backfill.yml': viaEnv }, { baseline: [site] }));
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /matched nothing/);
});

test('--update-baseline re-records the sites and keeps their reasons', () => {
  const site = 'run-backfill.yml|backfill|${{ inputs.id }}';
  const root = repo({ 'run-backfill.yml': interpolated }, { baseline: [{ key: site, reason: 'why' }, 'gone|x|y'] });
  assert.equal(check(root, '--update-baseline').status, 0);
  const doc = JSON.parse(fs.readFileSync(path.join(root, '.github/workflow-injection-baseline.json'), 'utf8'));
  assert.deepEqual(doc.accepted, [{ key: site, reason: 'why' }]);
});

test('paths come from the repo config', () => {
  const root = repo({ 'x.yml': interpolated }, { config: { workflowsDir: 'ci/wf', baseline: 'ci/baseline.json' }, baseline: ['x.yml|backfill|${{ inputs.id }}'] });
  const r = check(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 baselined/);
});

test('a workflow the reader cannot parse fails closed, naming the file and line', () => {
  const r = check(repo({
    'ok.yml': viaEnv,
    'anchored.yml': wf(`      - name: Summary
        run: &cmd echo "\${{ inputs.id }}"
      - run: *cmd
`),
  }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read anchored\.yml: anchors, aliases and tags are not supported \(line \d+\)/);
});
