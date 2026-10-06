import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkState, decideAutoMerge, soakHours } from '../auto-promote-main.mjs';

const SHA = 'a'.repeat(40);
const DEPLOYED = '2026-10-07T10:00:00Z';

function green(overrides = {}) {
  return {
    pr: {
      number: 500,
      title: '1.6.0',
      baseRefName: 'main',
      headRefName: 'beta',
      headRefOid: SHA,
      isCrossRepository: false,
      isDraft: false,
      labels: [],
      mergeable: 'MERGEABLE',
    },
    betaHead: SHA,
    runs: [
      { id: 1, name: 'Deploy beta', status: 'completed', conclusion: 'success', updated_at: DEPLOYED },
      { id: 2, name: 'beta-build-and-submit', status: 'completed', conclusion: 'success', updated_at: DEPLOYED },
      { id: 3, name: 'android-e2e', status: 'completed', conclusion: 'success', updated_at: DEPLOYED },
    ],
    requiredChecks: ['Lint, typecheck, unit, build', 'Emulator tests (integration + rules + functions)'],
    checks: [
      { id: 10, name: 'Lint, typecheck, unit, build', status: 'completed', conclusion: 'success' },
      { id: 11, name: 'Emulator tests (integration + rules + functions)', status: 'completed', conclusion: 'success' },
    ],
    now: '2026-10-07T12:30:00Z',
    soakHours: '2',
    enabled: true,
    hasToken: true,
    ...overrides,
  };
}

const withPr = (patch) => green({ pr: { ...green().pr, ...patch } });
const withRun = (name, patch) =>
  green({ runs: green().runs.map((r) => (r.name === name ? { ...r, ...patch } : r)) });

describe('decideAutoMerge', () => {
  it('merges when everything is green, soaked, enabled and the token is set', () => {
    const d = decideAutoMerge(green());
    assert.equal(d.action, 'merge');
    assert.equal(d.pr, 500);
    assert.equal(d.sha, SHA);
    assert.deepEqual(d.blockers, []);
  });

  it('does nothing without an open PR', () => {
    assert.equal(decideAutoMerge(green({ pr: null })).action, 'none');
  });

  it('only reports while AUTO_MERGE_TO_MAIN is off (the default)', () => {
    const d = decideAutoMerge(green({ enabled: false }));
    assert.equal(d.action, 'report');
    assert.match(d.notes.join(' '), /AUTO_MERGE_TO_MAIN/);
  });

  it('never merges without RELEASE_PR_TOKEN', () => {
    const d = decideAutoMerge(green({ hasToken: false }));
    assert.equal(d.action, 'report');
    assert.match(d.notes.join(' '), /RELEASE_PR_TOKEN/);
  });

  it('waits on a hold label, whatever its case', () => {
    for (const name of ['hold', 'Hold']) {
      const d = decideAutoMerge(withPr({ labels: [{ name: 'release' }, { name }] }));
      assert.equal(d.action, 'wait');
      assert.match(d.blockers.join(' '), /hold/);
    }
  });

  it('waits until the soak has passed since Deploy beta finished', () => {
    assert.equal(decideAutoMerge(green({ now: '2026-10-07T11:59:00Z' })).action, 'wait');
    assert.equal(decideAutoMerge(green({ now: '2026-10-07T12:00:00Z' })).action, 'merge');
    assert.equal(decideAutoMerge(green({ now: '2026-10-07T10:00:00Z', soakHours: '0' })).action, 'merge');
    assert.equal(decideAutoMerge(green({ now: '2026-10-07T15:00:00Z', soakHours: '6' })).action, 'wait');
  });

  it('requires android-e2e green on the beta commit', () => {
    const missing = green({ runs: green().runs.filter((r) => r.name !== 'android-e2e') });
    assert.match(decideAutoMerge(missing).blockers.join(' '), /android-e2e on beta: missing/);
    assert.equal(decideAutoMerge(withRun('android-e2e', { conclusion: 'failure' })).action, 'wait');
    assert.equal(decideAutoMerge(withRun('android-e2e', { status: 'in_progress', conclusion: null })).action, 'wait');
  });

  it('judges the latest attempt of a workflow', () => {
    const retried = green({
      runs: [...green().runs, { id: 0, name: 'android-e2e', status: 'completed', conclusion: 'failure' }],
    });
    assert.equal(decideAutoMerge(retried).action, 'merge');
  });

  it('requires Deploy beta green; a missing beta build (docs-only push) is fine', () => {
    assert.equal(decideAutoMerge(withRun('Deploy beta', { conclusion: 'failure' })).action, 'wait');
    const noBuild = green({ runs: green().runs.filter((r) => r.name !== 'beta-build-and-submit') });
    assert.equal(decideAutoMerge(noBuild).action, 'merge');
    assert.equal(decideAutoMerge(withRun('beta-build-and-submit', { conclusion: 'failure' })).action, 'wait');
  });

  it('requires every required status check green on the head SHA', () => {
    const pending = green({ checks: [green().checks[0]] });
    assert.match(decideAutoMerge(pending).blockers.join(' '), /Emulator tests.*missing/);
    const failed = green({ checks: [green().checks[0], { ...green().checks[1], conclusion: 'failure' }] });
    assert.equal(decideAutoMerge(failed).action, 'wait');
  });

  it('waits when main\'s required checks could not be read', () => {
    assert.match(decideAutoMerge(green({ requiredChecks: [] })).blockers.join(' '), /could not be read/);
  });

  it('only touches the auto-opened release PR at beta\'s tip', () => {
    assert.equal(decideAutoMerge(withPr({ title: 'Release 1.6.0 → main' })).action, 'wait');
    assert.equal(decideAutoMerge(withPr({ headRefName: 'hotfix' })).action, 'wait');
    assert.equal(decideAutoMerge(withPr({ isCrossRepository: true })).action, 'wait');
    assert.equal(decideAutoMerge(withPr({ isDraft: true })).action, 'wait');
    assert.equal(decideAutoMerge(green({ betaHead: 'b'.repeat(40) })).action, 'wait');
    assert.equal(decideAutoMerge(withPr({ mergeable: 'CONFLICTING' })).action, 'wait');
  });

  it('refuses a title carrying a [skip-…] token', () => {
    assert.equal(decideAutoMerge(withPr({ title: '1.6.0 [skip-ota]' })).action, 'wait');
  });
});

describe('soakHours', () => {
  it('defaults to 2 when unset or invalid', () => {
    assert.equal(soakHours(undefined), 2);
    assert.equal(soakHours(''), 2);
    assert.equal(soakHours('abc'), 2);
    assert.equal(soakHours('-1'), 2);
    assert.equal(soakHours('0'), 0);
    assert.equal(soakHours('4.5'), 4.5);
  });
});

describe('checkState', () => {
  it('reads check runs and commit statuses', () => {
    assert.equal(checkState([{ name: 'x', state: 'success' }], 'x'), 'pass');
    assert.equal(checkState([{ name: 'x', state: 'pending' }], 'x'), 'pending');
    assert.equal(checkState([{ name: 'x', state: 'error' }], 'x'), 'fail');
    assert.equal(checkState([{ id: 1, name: 'x', status: 'queued', conclusion: null }], 'x'), 'pending');
    assert.equal(checkState([], 'x'), 'missing');
  });
});
