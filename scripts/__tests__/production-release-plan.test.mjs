import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OTA_IGNORED_PATHS,
  backendJobs,
  chooseBase,
  decideProductionRelease,
  isBundlePath,
  latestDeployRun,
  readDeployState,
} from '../production-release-plan.mjs';

const BASE = 'abcdef0123456789abcdef0123456789abcdef01';

/** A version-bumping promotion merge with a bundle change and no switch set: everything ships. */
function release(overrides = {}) {
  return {
    version: '1.8.0',
    previous: '1.7.1',
    base: BASE,
    configVersion: '1.8.0',
    hasNotes: true,
    commitMessage: 'Merge pull request #900 from cultuvilla/beta\n\n1.8.0',
    vars: {},
    changedFiles: ['apps/mobile/app/index.tsx', 'CHANGELOG.md', ''],
    ...overrides,
  };
}

const SKIP_DEPLOY = '[skip-deploy]: the prod backend for this commit was not deployed';

describe('decideProductionRelease — store binaries', () => {
  it('ships everything on a version bump with no switch set', () => {
    assert.deepEqual(decideProductionRelease(release()), {
      errors: [],
      warnings: [],
      store: true,
      reason: '1.7.1 -> 1.8.0',
      android: true,
      androidReason: '1.7.1 -> 1.8.0',
      ota: true,
      otaReason: 'bundle sources changed since abcdef0',
    });
  });

  const cases = [
    ['an unchanged version', { previous: '1.8.0' }, 'version unchanged (1.8.0)'],
    ['[skip-store]', { commitMessage: 'x [skip-store] y' }, '[skip-store] in the commit message'],
    ['STORE_RELEASE_PAUSED=true', { vars: { STORE_RELEASE_PAUSED: 'true' } }, 'STORE_RELEASE_PAUSED=true'],
    ['[skip-deploy]', { commitMessage: '[skip-deploy]' }, SKIP_DEPLOY],
  ];
  for (const [name, overrides, reason] of cases) {
    it(`ships no binaries, either store, on ${name}`, () => {
      const d = decideProductionRelease(release(overrides));
      assert.equal(d.store, false);
      assert.equal(d.reason, reason);
      // Android inherits every store decision, reason included.
      assert.equal(d.android, false);
      assert.equal(d.androidReason, reason);
      assert.deepEqual(d.warnings, []);
    });
  }

  it('reads STORE_RELEASE_PAUSED only as the exact string "true"', () => {
    for (const value of ['TRUE', '1', 'yes', '', undefined]) {
      assert.equal(decideProductionRelease(release({ vars: { STORE_RELEASE_PAUSED: value } })).store, true, String(value));
    }
  });

  it('keeps today’s precedence: [skip-deploy], then version, then [skip-store], then the pause', () => {
    const all = {
      previous: '1.8.0',
      commitMessage: '[skip-deploy] [skip-store]',
      vars: { STORE_RELEASE_PAUSED: 'true' },
    };
    assert.equal(decideProductionRelease(release(all)).reason, SKIP_DEPLOY);
    assert.equal(
      decideProductionRelease(release({ ...all, commitMessage: '[skip-store]' })).reason,
      'version unchanged (1.8.0)',
    );
    assert.equal(
      decideProductionRelease(release({ ...all, previous: '1.7.1', commitMessage: '[skip-store]' })).reason,
      '[skip-store] in the commit message',
    );
    assert.equal(
      decideProductionRelease(release({ ...all, previous: '1.7.1', commitMessage: '' })).reason,
      'STORE_RELEASE_PAUSED=true',
    );
  });

  it('ships binaries on a version going down too — only "unchanged" stops it', () => {
    assert.equal(decideProductionRelease(release({ previous: '1.9.0' })).reason, '1.9.0 -> 1.8.0');
  });

  it('ships binaries on a docs-only bump (the OTA is what the paths decide)', () => {
    const d = decideProductionRelease(release({ changedFiles: ['CHANGELOG.md', 'docs/x.md'] }));
    assert.equal(d.store, true);
    assert.equal(d.ota, false);
  });
});

describe('decideProductionRelease — store preconditions', () => {
  it('refuses when app.config.ts and package.json disagree', () => {
    assert.deepEqual(decideProductionRelease(release({ configVersion: '1.7.1' })), {
      errors: [
        'apps/mobile/app.config.ts says 1.7.1 but package.json says 1.8.0 — nothing ships. Make them agree (pnpm release:cut writes both).',
      ],
    });
  });

  it('refuses when app.config.ts has no readable version', () => {
    assert.match(decideProductionRelease(release({ configVersion: '' })).errors[0], /app\.config\.ts says {2}but/);
  });

  it('refuses without a usable CHANGELOG section', () => {
    assert.deepEqual(decideProductionRelease(release({ hasNotes: false })), {
      errors: ["CHANGELOG.md has no usable '## v1.8.0' section — nothing ships."],
    });
  });

  it('reports the version mismatch first when both fail', () => {
    const d = decideProductionRelease(release({ configVersion: '1.7.1', hasNotes: false }));
    assert.equal(d.errors.length, 1);
    assert.match(d.errors[0], /^apps\/mobile\/app\.config\.ts/);
  });

  // A kill-switch must still land a fix on main without a red run.
  for (const [name, overrides] of [
    ['an unchanged version', { previous: '1.8.0' }],
    ['[skip-store]', { commitMessage: '[skip-store]' }],
    ['STORE_RELEASE_PAUSED', { vars: { STORE_RELEASE_PAUSED: 'true' } }],
    ['[skip-deploy]', { commitMessage: '[skip-deploy]' }],
  ]) {
    it(`checks nothing when no binaries ship (${name})`, () => {
      const d = decideProductionRelease(release({ ...overrides, configVersion: 'nope', hasNotes: false }));
      assert.deepEqual(d.errors, []);
      assert.equal(d.store, false);
    });
  }
});

describe('decideProductionRelease — the Play freeze', () => {
  it('stops Android only, and warns, when binaries ship', () => {
    const d = decideProductionRelease(release({ vars: { PLAY_SUBMIT_PAUSED: 'true' } }));
    assert.equal(d.store, true);
    assert.equal(d.reason, '1.7.1 -> 1.8.0');
    assert.equal(d.android, false);
    assert.equal(d.androidReason, 'PLAY_SUBMIT_PAUSED=true — iOS ships 1.8.0 alone');
    assert.deepEqual(d.warnings, [
      'PLAY_SUBMIT_PAUSED=true: iOS ships 1.8.0 and Android does not. Once Play is unfrozen, re-run this workflow run or dispatch mobile-release (platform android, track production).',
    ]);
    assert.equal(d.ota, true, 'the Play freeze never stops the OTA');
  });

  it('says nothing when no binaries ship, or every hotfix push cries wolf', () => {
    const d = decideProductionRelease(release({ previous: '1.8.0', vars: { PLAY_SUBMIT_PAUSED: 'true' } }));
    assert.deepEqual(d.warnings, []);
    assert.equal(d.androidReason, 'version unchanged (1.8.0)');
  });

  it('still refuses a broken precondition before the freeze is read', () => {
    const d = decideProductionRelease(release({ hasNotes: false, vars: { PLAY_SUBMIT_PAUSED: 'true' } }));
    assert.equal(d.errors.length, 1);
  });

  it('reads it only as the exact string "true"', () => {
    assert.equal(decideProductionRelease(release({ vars: { PLAY_SUBMIT_PAUSED: 'false' } })).android, true);
  });
});

describe('decideProductionRelease — the production OTA', () => {
  const cases = [
    ['[skip-deploy]', { commitMessage: '[skip-deploy]' }, SKIP_DEPLOY],
    ['a docs/.github/*.md-only diff', { changedFiles: ['docs/a.ts', '.github/workflows/x.yml', 'README.md', ''] }, 'only docs/.github changes'],
    ['an empty diff', { changedFiles: [''] }, 'only docs/.github changes'],
    ['no diff at all', { changedFiles: [] }, 'only docs/.github changes'],
    ['[skip-ota]', { commitMessage: '[skip-ota]' }, '[skip-ota] in the commit message'],
    ['PROD_OTA_PAUSED=true', { vars: { PROD_OTA_PAUSED: 'true' } }, 'PROD_OTA_PAUSED=true'],
  ];
  for (const [name, overrides, otaReason] of cases) {
    it(`skips it on ${name}`, () => {
      const d = decideProductionRelease(release(overrides));
      assert.equal(d.ota, false);
      assert.equal(d.otaReason, otaReason);
    });
  }

  it('keeps today’s precedence: [skip-deploy], then paths, then [skip-ota], then the pause', () => {
    const vars = { PROD_OTA_PAUSED: 'true' };
    const docs = ['docs/a.md'];
    assert.equal(decideProductionRelease(release({ commitMessage: '[skip-deploy] [skip-ota]', changedFiles: docs, vars })).otaReason, SKIP_DEPLOY);
    assert.equal(decideProductionRelease(release({ commitMessage: '[skip-ota]', changedFiles: docs, vars })).otaReason, 'only docs/.github changes');
    assert.equal(decideProductionRelease(release({ commitMessage: '[skip-ota]', vars })).otaReason, '[skip-ota] in the commit message');
  });

  it('publishes on a bundle change even with every store switch set', () => {
    const d = decideProductionRelease(
      release({ previous: '1.8.0', commitMessage: '[skip-store]', vars: { STORE_RELEASE_PAUSED: 'true', PLAY_SUBMIT_PAUSED: 'true' } }),
    );
    assert.equal(d.store, false);
    assert.equal(d.ota, true);
  });

  it('never lets an OTA switch stop the binaries', () => {
    const d = decideProductionRelease(release({ commitMessage: '[skip-ota]', vars: { PROD_OTA_PAUSED: 'true' } }));
    assert.equal(d.store, true);
    assert.equal(d.android, true);
  });

  it('names the base by its short sha', () => {
    assert.equal(decideProductionRelease(release({ base: '1234567890' })).otaReason, 'bundle sources changed since 1234567');
  });
});

describe('isBundlePath', () => {
  it('ignores exactly docs/**, **/*.md and .github/**', () => {
    assert.deepEqual([...OTA_IGNORED_PATHS].sort(), ['**/*.md', '.github/**', 'docs/**']);
    for (const p of ['docs/plans/x.ts', '.github/workflows/ci.yml', 'README.md', 'apps/mobile/README.md', 'CHANGELOG.md']) {
      assert.equal(isBundlePath(p), false, p);
    }
    for (const p of ['apps/mobile/app/index.tsx', 'packages/docs/x.ts', 'a.github/x', 'notes.mdx', 'scripts/x.mjs', 'apps/docs.ts']) {
      assert.equal(isBundlePath(p), true, p);
    }
  });
});

describe('chooseBase', () => {
  const yes = () => true;
  const no = () => false;
  it('takes `before` when it is a commit here', () => {
    assert.equal(chooseBase(BASE, yes), BASE);
  });
  it('falls back to the first parent on a branch creation, an empty or an unknown `before`', () => {
    assert.equal(chooseBase('0000000000000000000000000000000000000000', yes), null);
    assert.equal(chooseBase('', yes), null);
    assert.equal(chooseBase(BASE, no), null);
  });
  it('never asks git about an all-zeros sha', () => {
    assert.equal(chooseBase('0000', () => assert.fail('asked')), null);
  });
});

describe('latestDeployRun', () => {
  it('picks the newest Deploy prod run, ignoring other workflows', () => {
    const runs = {
      workflow_runs: [
        { id: 5, name: 'Deploy prod', status: 'completed' },
        { id: 9, name: 'Production release', status: 'in_progress' },
        { id: 7, name: 'Deploy prod', status: 'in_progress' },
      ],
    };
    assert.deepEqual(latestDeployRun(runs), { id: 7, name: 'Deploy prod', status: 'in_progress' });
  });
  it('is null with no Deploy prod run, or no response', () => {
    assert.equal(latestDeployRun({ workflow_runs: [{ id: 1, name: 'CI' }] }), null);
    assert.equal(latestDeployRun({ workflow_runs: [] }), null);
    assert.equal(latestDeployRun(null), null);
  });
});

describe('backendJobs', () => {
  it('keeps only `deploy / …` jobs and marks a skipped functions step as held', () => {
    const jobs = backendJobs({
      jobs: [
        { name: 'tag', status: 'completed', conclusion: 'success' },
        {
          name: 'deploy / Deploy prod backend',
          status: 'completed',
          conclusion: 'success',
          steps: [
            { name: 'Deploy Firestore rules', conclusion: 'skipped' },
            { name: 'Deploy Cloud Functions', conclusion: 'skipped' },
          ],
        },
        { name: 'deploy / other', status: 'queued', conclusion: null },
      ],
    });
    assert.deepEqual(jobs, [
      { name: 'deploy / Deploy prod backend', status: 'completed', conclusion: 'success', held: true },
      { name: 'deploy / other', status: 'queued', conclusion: null, held: false },
    ]);
  });
  it('is not held when the functions step ran, or another step skipped', () => {
    const [job] = backendJobs({
      jobs: [
        {
          name: 'deploy / x',
          steps: [
            { name: 'Deploy Cloud Functions', conclusion: 'success' },
            { name: 'Deploy Hosting', conclusion: 'skipped' },
          ],
        },
      ],
    });
    assert.equal(job.held, false);
  });
});

describe('readDeployState', () => {
  const done = (conclusion, held = false) => ({ name: 'deploy / x', status: 'completed', conclusion, held });
  const run = (status = 'completed') => ({ id: 42, status });

  it('waits while there is no run, or an API call failed', () => {
    assert.deepEqual(readDeployState(null, null), { state: 'waiting' });
    assert.deepEqual(readDeployState(run(), null), { state: 'waiting' });
  });
  it('waits for a run that has no backend job yet', () => {
    assert.deepEqual(readDeployState(run('in_progress'), []), { state: 'waiting' });
  });
  it('fails a finished run without a backend job', () => {
    assert.deepEqual(readDeployState(run(), []), { state: 'no-backend' });
  });
  it('waits while any backend job is still running', () => {
    assert.deepEqual(readDeployState(run('in_progress'), [done('success'), { ...done(null), status: 'in_progress' }]), {
      state: 'waiting',
    });
  });
  it('is green when every backend job succeeded', () => {
    assert.deepEqual(readDeployState(run(), [done('success')]), { state: 'green', held: false });
  });
  it('is green and held when a job skipped its functions step', () => {
    assert.deepEqual(readDeployState(run(), [done('success'), done('success', true)]), { state: 'green', held: true });
  });
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out']) {
    it(`fails on a ${conclusion} backend job — only success is deployed`, () => {
      assert.deepEqual(readDeployState(run(), [done('success'), done(conclusion, true)]), { state: 'failed' });
    });
  }
});
