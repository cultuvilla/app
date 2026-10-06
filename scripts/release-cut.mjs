#!/usr/bin/env node
/**
 * pnpm release:cut — cut a release from develop and open its PR into beta.
 *
 *   1. Proposes the bump from the conventional commits on develop since beta
 *      (fix → patch, feat → minor, `!` / BREAKING CHANGE → major).
 *   2. Commits the bump on top of origin/develop — app.config.ts, package.json
 *      and the CHANGELOG stamp — with the bare `X.Y.Z` message commitlint
 *      exempts, and pushes it to develop. develop's version is therefore always
 *      the latest cut, with no second PR to land.
 *   3. Branches `release/X.Y.Z` from that commit and merges origin/main into it:
 *      beta and main are `strict`, and the beta → main merge commits never reach
 *      develop, so a PR straight from develop would be behind beta.
 *   4. Pushes the branch and opens the PR → beta titled `X.Y.Z`, with the
 *      CHANGELOG section and a checklist of its `**Migration:**` notes.
 *
 * All git work happens in a throwaway worktree, so the checkout you run it from
 * never leaves develop. When develop already carries a version newer than beta
 * (its bump landed earlier) the cut skips step 2 and releases that version.
 *
 * `--breaking="<reason>"` declares the release breaking for installed clients:
 * the bump commit carries a `Breaking-Client: <reason>` trailer, which
 * breaking-rollup.mjs reads on the prod deploy to hold the backend and raise
 * the wall. With no bump to make, an empty `chore(release): declare X.Y.Z
 * breaking` commit carries it instead.
 *
 *   pnpm release:cut [--dry-run] [--bump=patch|minor|major | --version=X.Y.Z] [--breaking="<reason>"]
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractVersion } from './lib/app-version.mjs';
import {
  breakingTrailer,
  bumpVersion,
  compareVersions,
  extractMigrations,
  hasVersionSection,
  parseSemver,
  proposeBump,
  releaseCommitMessage,
  releasePrBody,
  setAppConfigVersion,
  setPackageJsonVersion,
  stampChangelog,
  versionSection,
} from './lib/release.mjs';

const PATHS = {
  appConfig: 'apps/mobile/app.config.ts',
  packageJson: 'apps/mobile/package.json',
  changelog: 'CHANGELOG.md',
};

export function parseArgs(argv) {
  const args = { dryRun: false, bump: null, version: null, breaking: null };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--bump=')) args.bump = arg.slice('--bump='.length);
    else if (arg.startsWith('--version=')) args.version = arg.slice('--version='.length);
    else if (arg === '--breaking' || arg.startsWith('--breaking=')) args.breaking = arg.slice('--breaking='.length);
    else throw new Error(`Unknown argument "${arg}"`);
  }
  if (args.bump && !['patch', 'minor', 'major'].includes(args.bump)) {
    throw new Error(`--bump must be patch, minor or major, not "${args.bump}"`);
  }
  if (args.bump && args.version) throw new Error('Pass --bump or --version, not both');
  if (args.version) parseSemver(args.version);
  if (args.breaking !== null) {
    breakingTrailer(args.breaking);
    args.breaking = args.breaking.trim();
  }
  return args;
}

/**
 * Decide what the cut releases and produce the new file contents. Pure.
 *
 * @param {{
 *   develop: { appConfig: string, packageJson: string, changelog: string },
 *   betaVersion: string,
 *   commits: { subject: string, body?: string }[],
 *   date: string,
 *   args: { bump: string | null, version: string | null, breaking?: string | null },
 * }} input
 */
export function planCut({ develop, betaVersion, commits, date, args }) {
  const breaking = args.breaking ?? null;
  const developVersion = extractVersion(develop.appConfig);

  if (compareVersions(developVersion, betaVersion) > 0) {
    if (args.bump || (args.version && args.version !== developVersion)) {
      throw new Error(
        `develop already carries ${developVersion} (beta is ${betaVersion}); cut that, or bump develop by hand first.`,
      );
    }
    if (!hasVersionSection(develop.changelog, developVersion)) {
      throw new Error(`develop is at ${developVersion} but CHANGELOG.md has no "## v${developVersion}" section.`);
    }
    const section = versionSection(develop.changelog, developVersion);
    return {
      version: developVersion,
      previous: betaVersion,
      bump: null,
      needsBumpCommit: false,
      commitMessage: releaseCommitMessage({ version: developVersion, bumped: false, breaking }),
      breaking,
      files: null,
      section,
      migrations: extractMigrations(section),
    };
  }

  const proposed = proposeBump(commits);
  if (!proposed && !args.version && !args.bump) {
    throw new Error('develop has nothing to release: no commits since beta.');
  }
  const bump = args.bump ?? proposed;
  const version = args.version ?? bumpVersion(betaVersion, bump);
  if (compareVersions(version, betaVersion) <= 0) {
    throw new Error(`The release version must be greater than beta's ${betaVersion}, not ${version}.`);
  }

  const changelog = stampChangelog(develop.changelog, version, date);
  const section = versionSection(changelog, version);
  return {
    version,
    previous: betaVersion,
    bump: args.version ? null : bump,
    needsBumpCommit: true,
    commitMessage: releaseCommitMessage({ version, bumped: true, breaking }),
    breaking,
    files: {
      appConfig: setAppConfigVersion(develop.appConfig, version),
      packageJson: setPackageJsonVersion(develop.packageJson, version),
      changelog,
    },
    section,
    migrations: extractMigrations(section),
  };
}

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function commitsSinceBeta() {
  const raw = git(['log', '--no-merges', '--format=%s%x1f%b%x1e', 'origin/beta..origin/develop']);
  return raw
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject, body = ''] = entry.split('\x1f');
      return { subject, body };
    });
}

function preflight() {
  if (git(['status', '--porcelain'])) throw new Error('The working tree is dirty — commit or set aside your changes first.');
  const branch = git(['branch', '--show-current']);
  if (branch !== 'develop') throw new Error(`Run release:cut from develop, not "${branch || 'a detached HEAD'}".`);
  git(['fetch', '--quiet', 'origin', 'develop', 'beta', 'main']);
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/develop'])) {
    throw new Error('Local develop differs from origin/develop — pull (or push) first so the cut is what everyone sees.');
  }
  execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
}

function show(rev, file) {
  return git(['show', `${rev}:${file}`]) + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  preflight();

  const plan = planCut({
    develop: {
      appConfig: show('origin/develop', PATHS.appConfig),
      packageJson: show('origin/develop', PATHS.packageJson),
      changelog: show('origin/develop', PATHS.changelog),
    },
    betaVersion: extractVersion(show('origin/beta', PATHS.appConfig)),
    commits: commitsSinceBeta(),
    date: new Date().toISOString().slice(0, 10),
    args,
  });

  const branch = `release/${plan.version}`;
  const body = releasePrBody(plan);
  console.log(`Release ${plan.version} (beta is ${plan.previous})`);
  console.log(
    plan.needsBumpCommit
      ? `  bump: ${plan.bump ?? 'explicit --version'} — commit "${plan.version}" on develop (${Object.values(PATHS).join(', ')})`
      : plan.commitMessage
        ? `  develop already carries ${plan.version}; an empty commit on develop declares it breaking`
        : `  develop already carries ${plan.version}; no bump commit`,
  );
  if (plan.breaking) console.log(`  breaking: trailer "${breakingTrailer(plan.breaking)}"`);
  console.log(`  branch: ${branch} = develop + merge of origin/main`);
  console.log(`  PR: ${branch} → beta, titled "${plan.version}"`);
  console.log(`  migrations: ${plan.migrations.length}`);

  if (args.dryRun) {
    console.log('\n--- PR body ---\n' + body);
    console.log('\nDry run: nothing written or pushed.');
    return;
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), 'release-cut-'));
  try {
    git(['worktree', 'add', '--detach', dir, 'origin/develop']);
    const inTree = (gitArgs) => git(gitArgs, { cwd: dir });

    if (plan.needsBumpCommit) {
      for (const [key, file] of Object.entries(PATHS)) writeFileSync(path.join(dir, file), plan.files[key]);
      inTree(['add', ...Object.values(PATHS)]);
      // --no-verify: the hooks need this checkout's node_modules, which a
      // throwaway worktree lacks. The bare version is exactly what commitlint
      // exempts, and the files are generated above.
      inTree(['commit', '--no-verify', '-m', plan.commitMessage]);
    } else if (plan.commitMessage) {
      inTree(['commit', '--allow-empty', '--no-verify', '-m', plan.commitMessage]);
    }
    if (plan.commitMessage) {
      // A plain push refuses a non-fast-forward, so a develop that moved since
      // the fetch stops the cut instead of being overwritten.
      inTree(['push', 'origin', 'HEAD:refs/heads/develop']);
      console.log(`Pushed "${plan.commitMessage.split('\n')[0]}" to develop.`);
    }

    inTree(['checkout', '-b', branch]);
    try {
      inTree(['merge', '--no-ff', '--no-verify', '--no-edit', '-m', `Merge main into ${branch}`, 'origin/main']);
    } catch (err) {
      inTree(['merge', '--abort']);
      throw new Error(`Merging origin/main into ${branch} conflicts — resolve by hand.\n${err.stderr ?? err.message}`);
    }
    inTree(['push', '--set-upstream', 'origin', branch]);

    const existing = execFileSync(
      'gh',
      ['pr', 'list', '--base', 'beta', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[0].url // ""'],
      { encoding: 'utf8' },
    ).trim();
    const bodyFile = path.join(dir, '.release-pr-body.md');
    writeFileSync(bodyFile, body);
    const url = existing
      ? (execFileSync('gh', ['pr', 'edit', existing, '--title', plan.version, '--body-file', bodyFile], { encoding: 'utf8' }),
        existing)
      : execFileSync(
          'gh',
          ['pr', 'create', '--base', 'beta', '--head', branch, '--title', plan.version, '--body-file', bodyFile],
          { encoding: 'utf8' },
        ).trim();
    console.log(`\nRelease PR: ${url}`);
  } finally {
    try {
      git(['worktree', 'remove', '--force', dir]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Bring the checkout this ran from up to the commit the cut made.
  if (plan.commitMessage) git(['merge', '--ff-only', '--quiet', 'origin/develop']);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    console.error(`release:cut: ${err.message}`);
    process.exit(1);
  }
}
