import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  breakingTrailer,
  bumpVersion,
  COMMIT_LINE_MAX,
  compareVersions,
  extractMigrations,
  isFragmentPath,
  migrationChecklist,
  promotionPrBody,
  proposeBump,
  releaseCommitMessage,
  releasePrBody,
  releasePrProblems,
  setAppConfigVersion,
  setPackageJsonVersion,
  stampChangelog,
  unreleasedBody,
  versionSection,
} from '../lib/release.mjs';
import { parseArgs, planCut } from '../release-cut.mjs';
import { rollupBreaking } from '../lib/breaking-rollup.mjs';

const commitlintExempt = (message) =>
  createRequire(import.meta.url)('../../commitlint.config.cjs').ignores.some((ignore) => ignore(message));

const c = (subject, body = '') => ({ subject, body });

describe('proposeBump', () => {
  it('fix → patch, feat → minor, ! or BREAKING CHANGE → major', () => {
    assert.equal(proposeBump([c('fix(x): a'), c('chore: b')]), 'patch');
    assert.equal(proposeBump([c('fix(x): a'), c('feat(y): b')]), 'minor');
    assert.equal(proposeBump([c('feat(y)!: b'), c('fix: a')]), 'major');
    assert.equal(proposeBump([c('refactor: a', 'BREAKING CHANGE: gone')]), 'major');
  });

  it('a release made of docs/chores is still a patch', () => {
    assert.equal(proposeBump([c('docs(plans): x'), c('Merge pull request #1 from a/b')]), 'patch');
  });

  it('nothing but version-bump commits is nothing to release', () => {
    assert.equal(proposeBump([c('1.6.0')]), null);
    assert.equal(proposeBump([]), null);
  });
});

describe('versions', () => {
  it('bumps and compares numerically', () => {
    assert.equal(bumpVersion('1.9.3', 'patch'), '1.9.4');
    assert.equal(bumpVersion('1.9.3', 'minor'), '1.10.0');
    assert.equal(bumpVersion('1.9.3', 'major'), '2.0.0');
    assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.throws(() => bumpVersion('1.0', 'patch'), /Invalid version/);
  });

  it('rewrites only the top-level version in app.config.ts and package.json', () => {
    const cfg = "export default {\n  name: 'x',\n  version: '1.5.0',\n  ios: { buildNumber: '3' },\n};\n";
    assert.equal(setAppConfigVersion(cfg, '1.6.0'), cfg.replace("'1.5.0'", "'1.6.0'"));
    const pkg = '{\n  "name": "m",\n  "version": "1.5.0",\n  "dependencies": {}\n}\n';
    assert.equal(setPackageJsonVersion(pkg, '1.6.0'), pkg.replace('"1.5.0"', '"1.6.0"'));
  });
});

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

<!-- store-notes -->
- **Lo nuevo.**
<!-- /store-notes -->

- Added a thing. **Migration:** \`organizations.joinPolicy\` is filled by
  \`scripts/backfill-org-join-policy.mjs\` (pre-deploy, autoApply).
- Fixed another thing.

## v1.5.0 — 2026-09-29

- Old.
`;

describe('stampChangelog', () => {
  it('moves [Unreleased] under a dated heading and reopens it empty', () => {
    const out = stampChangelog(CHANGELOG, '1.6.0', '2026-10-06');
    assert.match(out, /## \[Unreleased\]\n\n## v1\.6\.0 — 2026-10-06\n\n<!-- store-notes -->/);
    assert.equal(unreleasedBody(out).trim(), '');
    assert.match(versionSection(out, '1.6.0'), /Fixed another thing\.$/);
    assert.match(out, /Fixed another thing\.\n\n## v1\.5\.0/);
  });

  it('refuses an empty [Unreleased]', () => {
    const empty = stampChangelog(CHANGELOG, '1.6.0', '2026-10-06');
    assert.throws(() => stampChangelog(empty, '1.7.0', '2026-10-07'), /both empty/);
  });

  it('refuses a release without store notes', () => {
    const noNotes = CHANGELOG.replace(/<!-- store-notes -->[\s\S]*<!-- \/store-notes -->\n/, '');
    assert.throws(() => stampChangelog(noNotes, '1.6.0', '2026-10-06'), /store-notes/);
  });

  it('refuses a version that is already stamped', () => {
    assert.throws(() => stampChangelog(CHANGELOG, '1.5.0', '2026-10-06'), /already has/);
  });
});

describe('changelog fragments', () => {
  const fragments = [
    { path: 'changelog.d/zz-later.md', content: '- Zeta entry.\n' },
    { path: 'changelog.d/aa-first.md', content: '- Alpha entry. **Migration:** run `scripts/backfill-x.mjs`.\n' },
  ];

  it('folds every fragment into the stamped section, in filename order', () => {
    const section = versionSection(stampChangelog(CHANGELOG, '1.6.0', '2026-10-06', fragments), '1.6.0');
    assert.match(section, /<!-- \/store-notes -->[\s\S]*Fixed another thing\.\n\n- Alpha entry\.[\s\S]*\n- Zeta entry\.$/);
    assert.equal(extractMigrations(section).length, 2);
  });

  it('stamps a release whose entries are all fragments', () => {
    const notesOnly = CHANGELOG.replace(/\n- Added a thing[\s\S]*Fixed another thing\.\n/, '');
    const section = versionSection(stampChangelog(notesOnly, '1.6.0', '2026-10-06', fragments), '1.6.0');
    assert.match(section, /<!-- \/store-notes -->\n\n- Alpha entry\./);
  });

  it('still refuses a release with fragments but no store notes', () => {
    const noNotes = CHANGELOG.replace(/<!-- store-notes -->[\s\S]*<!-- \/store-notes -->\n/, '');
    assert.throws(() => stampChangelog(noNotes, '1.6.0', '2026-10-06', fragments), /store-notes/);
  });

  it('treats only changelog.d/*.md, minus the README, as fragments', () => {
    assert.equal(isFragmentPath('changelog.d/intro-sound.md'), true);
    assert.equal(isFragmentPath('changelog.d/README.md'), false);
    assert.equal(isFragmentPath('changelog.d/notes.txt'), false);
    assert.equal(isFragmentPath('docs/changelog.d/x.md'), false);
  });
});

describe('migrations', () => {
  it('joins a wrapped **Migration:** bullet into one checklist line', () => {
    const section = versionSection(stampChangelog(CHANGELOG, '1.6.0', '2026-10-06'), '1.6.0');
    const migrations = extractMigrations(section);
    assert.deepEqual(migrations, [
      '`organizations.joinPolicy` is filled by `scripts/backfill-org-join-policy.mjs` (pre-deploy, autoApply).',
    ]);
    assert.match(migrationChecklist(migrations), /^- \[ \] `organizations\.joinPolicy`/m);
    assert.match(migrationChecklist([]), /no data moves/);
  });

  it('puts the checklist and CHANGELOG into both PR bodies', () => {
    const args = { version: '1.6.0', previous: '1.5.0', section: '- Old.', migrations: ['x'] };
    assert.match(releasePrBody(args), /- \[ \] x[\s\S]*## CHANGELOG v1\.6\.0\n\n- Old\./);
    const promo = promotionPrBody({ ...args, runs: [{ name: 'Deploy beta', url: 'u', conclusion: 'success' }] });
    assert.match(promo, /\[Deploy beta\]\(u\) — success/);
    assert.match(promo, /- \[ \] x/);
  });
});

describe('releasePrProblems', () => {
  const ok = (pr) => assert.deepEqual(releasePrProblems(pr), []);
  const bad = (pr, re) => assert.match(releasePrProblems(pr).join('\n'), re);

  it('beta takes release/<its version>, titled with the bare version', () => {
    ok({ base: 'beta', headRef: 'release/1.6.0', title: '1.6.0', headVersion: '1.6.0', baseVersion: '1.5.0' });
    bad({ base: 'beta', headRef: 'release/1.6.1', title: '1.6.0', headVersion: '1.6.0' }, /named release/);
    bad({ base: 'beta', headRef: 'release/1.6.0', title: 'Release 1.6.0 → beta', headVersion: '1.6.0' }, /titled/);
    bad({ base: 'beta', headRef: 'develop', title: '1.6.0', headVersion: '1.6.0' }, /release:cut/);
    bad({ base: 'beta', headRef: 'feat/x', title: '1.6.0', headVersion: '1.6.0' }, /only receives/);
  });

  it('main takes only beta; a version-changing promotion is titled with it', () => {
    ok({ base: 'main', headRef: 'beta', title: '1.6.0', headVersion: '1.6.0', baseVersion: '1.5.0' });
    ok({ base: 'main', headRef: 'beta', title: 'anything', headVersion: '1.6.0', baseVersion: '1.6.0' });
    bad({ base: 'main', headRef: 'beta', title: '1.6.0 → main', headVersion: '1.6.0', baseVersion: '1.5.0' }, /titled/);
    bad({ base: 'main', headRef: 'develop', title: '1.6.0', headVersion: '1.6.0', baseVersion: '1.5.0' }, /only receives merges from beta/);
  });
});

describe('release:cut', () => {
  const files = (version) => ({
    appConfig: `export default {\n  version: '${version}',\n};\n`,
    packageJson: `{\n  "version": "${version}"\n}\n`,
  });

  it('parses overrides', () => {
    assert.deepEqual(parseArgs(['--dry-run', '--bump=minor']), { dryRun: true, bump: 'minor', version: null, breaking: null });
    assert.equal(parseArgs(['--version=2.0.0']).version, '2.0.0');
    assert.throws(() => parseArgs(['--bump=huge']), /--bump/);
    assert.throws(() => parseArgs(['--bump=minor', '--version=2.0.0']), /not both/);
  });

  it('proposes the bump from the commits since beta and stamps the files', () => {
    const plan = planCut({
      develop: { ...files('1.5.0'), changelog: CHANGELOG },
      betaVersion: '1.5.0',
      commits: [c('feat(x): y'), c('fix: z')],
      date: '2026-10-06',
      args: { bump: null, version: null },
    });
    assert.equal(plan.version, '1.6.0');
    assert.equal(plan.bump, 'minor');
    assert.equal(plan.needsBumpCommit, true);
    assert.match(plan.files.appConfig, /version: '1\.6\.0'/);
    assert.match(plan.files.packageJson, /"version": "1\.6\.0"/);
    assert.match(plan.files.changelog, /## v1\.6\.0 — 2026-10-06/);
    assert.equal(plan.migrations.length, 1);
  });

  it('stamps the fragments and lists them for deletion in the bump commit', () => {
    const plan = planCut({
      develop: {
        ...files('1.5.0'),
        changelog: CHANGELOG,
        fragments: [{ path: 'changelog.d/x.md', content: '- From a fragment.\n' }],
      },
      betaVersion: '1.5.0',
      commits: [c('fix: z')],
      date: '2026-10-06',
      args: { bump: null, version: null },
    });
    assert.match(plan.section, /- From a fragment\.$/);
    assert.deepEqual(plan.fragments, ['changelog.d/x.md']);
  });

  it('honours --version and --bump', () => {
    const base = { develop: { ...files('1.5.0'), changelog: CHANGELOG }, betaVersion: '1.5.0', commits: [c('fix: z')], date: 'd' };
    assert.equal(planCut({ ...base, args: { bump: 'major', version: null } }).version, '2.0.0');
    assert.equal(planCut({ ...base, args: { bump: null, version: '1.5.7' } }).version, '1.5.7');
    assert.throws(() => planCut({ ...base, args: { bump: null, version: '1.4.0' } }), /greater than beta/);
  });

  it('cuts a version develop already carries without bumping again', () => {
    const stamped = stampChangelog(CHANGELOG, '1.6.0', '2026-10-05');
    const plan = planCut({
      develop: { ...files('1.6.0'), changelog: stamped },
      betaVersion: '1.5.0',
      commits: [c('1.6.0'), c('feat: x')],
      date: '2026-10-06',
      args: { bump: null, version: null },
    });
    assert.equal(plan.version, '1.6.0');
    assert.equal(plan.needsBumpCommit, false);
    assert.equal(plan.migrations.length, 1);
  });

  it('refuses when there is nothing to release', () => {
    assert.throws(
      () =>
        planCut({
          develop: { ...files('1.5.0'), changelog: CHANGELOG },
          betaVersion: '1.5.0',
          commits: [],
          date: 'd',
          args: { bump: null, version: null },
        }),
      /nothing to release/,
    );
  });
});

describe('release:cut --breaking', () => {
  const files = (version) => ({
    appConfig: `export default {\n  version: '${version}',\n};\n`,
    packageJson: `{\n  "version": "${version}"\n}\n`,
  });
  const KEY = 'Breaking-' + 'Client';

  it('parses a reason and refuses a missing, multi-line or over-long one', () => {
    assert.equal(parseArgs(['--breaking= drops the v1 callable ']).breaking, 'drops the v1 callable');
    assert.throws(() => parseArgs(['--breaking']), /needs a reason/);
    assert.throws(() => parseArgs(['--breaking=']), /needs a reason/);
    assert.throws(() => parseArgs(['--breaking=a\nb']), /one-line/);
    const room = COMMIT_LINE_MAX - `${KEY}: `.length;
    assert.equal(breakingTrailer('x'.repeat(room)).length, COMMIT_LINE_MAX);
    assert.throws(() => parseArgs([`--breaking=${'x'.repeat(room + 1)}`]), new RegExp(`keep it to ${room}`));
  });

  it('puts the trailer on the bump commit, where the rollup reads it', () => {
    const plan = planCut({
      develop: { ...files('1.5.0'), changelog: CHANGELOG },
      betaVersion: '1.5.0',
      commits: [c('feat(x): y')],
      date: '2026-10-06',
      args: { bump: null, version: null, breaking: 'drops the v1 callable' },
    });
    assert.equal(plan.commitMessage, `1.6.0\n\n${KEY}: drops the v1 callable`);
    assert.deepEqual(rollupBreaking([plan.commitMessage], '1.6.0'), {
      breaking: true,
      reasons: ['drops the v1 callable'],
      minSupported: '1.6.0',
    });
    assert.match(releasePrBody(plan), /Breaking for installed clients:\*\* drops the v1 callable/);
  });

  it('keeps a plain bump commit as the bare version', () => {
    const plan = planCut({
      develop: { ...files('1.5.0'), changelog: CHANGELOG },
      betaVersion: '1.5.0',
      commits: [c('fix: z')],
      date: 'd',
      args: { bump: null, version: null },
    });
    assert.equal(plan.commitMessage, '1.5.1');
    assert.equal(rollupBreaking([plan.commitMessage], '1.5.1').breaking, false);
    assert.doesNotMatch(releasePrBody(plan), /Breaking for installed clients/);
  });

  // develop already carries the version, so there is no bump commit to carry
  // the trailer: an empty commit does, inside the rollup's tag range.
  it('declares an already-bumped release breaking with an empty commit', () => {
    const stamped = stampChangelog(CHANGELOG, '1.6.0', '2026-10-05');
    const base = { develop: { ...files('1.6.0'), changelog: stamped }, betaVersion: '1.5.0', commits: [c('1.6.0')], date: 'd' };
    assert.equal(planCut({ ...base, args: { bump: null, version: null } }).commitMessage, null);
    const plan = planCut({ ...base, args: { bump: null, version: null, breaking: 'tightens the event rules' } });
    assert.equal(plan.needsBumpCommit, false);
    assert.equal(plan.commitMessage, `chore(release): declare 1.6.0 breaking\n\n${KEY}: tightens the event rules`);
    assert.equal(rollupBreaking([plan.commitMessage], '1.6.0').breaking, true);
  });

  it('commitlint exempts the bare bump with or without the trailer, and nothing else', () => {
    assert.equal(commitlintExempt('1.6.0'), true);
    assert.equal(commitlintExempt(releaseCommitMessage({ version: '1.6.0', bumped: true, breaking: 'x'.repeat(83) })), true);
    assert.equal(commitlintExempt('1.6.0\n\nsome body'), false);
    assert.equal(commitlintExempt('feat: 1.6.0'), false);
  });
});
