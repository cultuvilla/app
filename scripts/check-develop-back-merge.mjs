#!/usr/bin/env node
/**
 * CI gate: nothing may bring beta or main history back into develop.
 *
 * Releases flow one way — develop → release/X.Y.Z → beta → main — and the
 * release branch merges origin/main in, so beta and main carry merge commits
 * develop must never get (AGENTS.md § Versioning & releases). A back-merge
 * drags them in, after which every later release PR diffs against history
 * that is already on both sides.
 *
 * The test is ancestry, not branch names: for each protected branch, every
 * merge-base of HEAD and that branch must already be an ancestor of the base
 * (develop before the change). If one is not, HEAD reaches a commit of that
 * branch that develop never had. A feature branch that merged develop in is
 * fine — the develop commits it brings are ancestors of the base.
 *
 *   node scripts/check-develop-back-merge.mjs --base=origin/develop [--head=HEAD]
 *   node scripts/check-develop-back-merge.mjs --ci
 *
 * `--ci` reads the GitHub event: a pull_request into develop checks its merge
 * ref against its first parent, a merge_group for develop checks the queue
 * commit against the queue's base_sha, and a push to develop checks
 * `before..HEAD`. Any other target is a no-op. It then fetches the commit
 * graph (no trees or blobs — a couple of seconds) of HEAD, beta and main.
 * Ported from ordago-apps scripts/check-develop-back-merge.js, which asks the
 * GitHub API per merge instead; here the job already has a checkout.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PROTECTED_BRANCHES = ['beta', 'main'];
const ZERO_SHA = /^0+$/;
const DEVELOP_REF = 'refs/heads/develop';

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isAncestor(ancestor, descendant, cwd) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch (err) {
    if (err.status === 1) return false;
    throw err;
  }
}

/**
 * What to check for this GitHub event, or why there is nothing to check.
 * @returns {{ base: string, head: string } | { skip: string }}
 */
export function resolveCheck({ eventName, baseRef, ref, event }) {
  if (eventName === 'pull_request') {
    if (baseRef !== 'develop') return { skip: `pull request into ${baseRef}, not develop` };
    // The checkout is refs/pull/N/merge, always a merge commit whose first
    // parent is the develop tip GitHub merged against.
    return { base: 'HEAD^1', head: 'HEAD' };
  }
  if (eventName === 'merge_group') {
    const group = event?.merge_group ?? {};
    if (group.base_ref !== DEVELOP_REF) return { skip: `merge queue for ${group.base_ref}, not develop` };
    if (!group.base_sha) throw new Error('develop-back-merge: merge_group event has no base_sha');
    return { base: group.base_sha, head: 'HEAD' };
  }
  if (eventName === 'push') {
    if (ref !== DEVELOP_REF) return { skip: `push to ${ref}, not develop` };
    const before = event?.before;
    if (!before || ZERO_SHA.test(before)) return { skip: 'push created develop; there is no previous tip' };
    return { base: before, head: 'HEAD' };
  }
  return { skip: `event ${eventName} is not checked` };
}

/**
 * Branches whose history `head` reaches beyond what `base` already had.
 * @returns {Array<{ branch: string, mergeBase: string, commits: string[] }>}
 */
export function findBackMerges({ base, head, branches, cwd }) {
  const offenders = [];
  for (const branch of branches) {
    try {
      git(['rev-parse', '--verify', '--quiet', `${branch}^{commit}`], cwd);
    } catch {
      // A missing ref must not read as a pass.
      throw new Error(`develop-back-merge: ${branch} is not a commit here; fetch it first`);
    }
    const mergeBases = git(['merge-base', '--all', head, branch], cwd).split('\n').filter(Boolean);
    for (const mergeBase of mergeBases) {
      if (isAncestor(mergeBase, base, cwd)) continue;
      const commits = git(['log', '--format=%h %s', '-n', '10', mergeBase, '--not', base], cwd)
        .split('\n')
        .filter(Boolean);
      offenders.push({ branch, mergeBase, commits });
    }
  }
  return offenders;
}

function fetchGraph(cwd) {
  const head = git(['rev-parse', 'HEAD'], cwd);
  const shallow = git(['rev-parse', '--is-shallow-repository'], cwd) === 'true';
  const refspecs = PROTECTED_BRANCHES.map((b) => `+refs/heads/${b}:refs/remotes/origin/${b}`);
  // tree:0 fetches commits only: ancestry is all this needs.
  execFileSync(
    'git',
    ['fetch', '--no-tags', '--filter=tree:0', ...(shallow ? ['--unshallow'] : []), 'origin', ...refspecs, head],
    { cwd, stdio: ['ignore', 'inherit', 'inherit'] },
  );
}

function parseArgs(argv) {
  const opts = { ci: false, base: null, head: 'HEAD' };
  for (const arg of argv) {
    if (arg === '--ci') opts.ci = true;
    else if (arg.startsWith('--base=')) opts.base = arg.slice('--base='.length);
    else if (arg.startsWith('--head=')) opts.head = arg.slice('--head='.length);
    else throw new Error(`develop-back-merge: unknown argument ${arg}`);
  }
  return opts;
}

export function main(argv = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  const opts = parseArgs(argv);
  let range;
  if (opts.ci) {
    const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
    const check = resolveCheck({
      eventName: env.GITHUB_EVENT_NAME,
      baseRef: env.GITHUB_BASE_REF,
      ref: env.GITHUB_REF,
      event,
    });
    if ('skip' in check) {
      console.log(`develop back-merge guard: nothing to check (${check.skip}).`);
      return 0;
    }
    fetchGraph(cwd);
    range = check;
  } else {
    if (!opts.base) throw new Error('develop-back-merge: pass --base=<develop before the change> or --ci');
    range = { base: opts.base, head: opts.head };
  }

  const branches = PROTECTED_BRANCHES.map((b) => `origin/${b}`);
  const offenders = findBackMerges({ ...range, branches, cwd });
  if (offenders.length === 0) {
    console.log(
      `develop back-merge guard: ${range.head} brings nothing of ${branches.join(' or ')} that develop lacked.`,
    );
    return 0;
  }
  for (const { branch, mergeBase, commits } of offenders) {
    console.log(
      `::error::Back-merge into develop: ${range.head} reaches ${branch} history develop never had ` +
        `(merge-base ${mergeBase.slice(0, 8)} is not on develop). Releases only flow develop → release/X.Y.Z → beta → main; ` +
        `rebuild the branch from origin/develop without merging ${branch} or a release/* branch.`,
    );
    for (const line of commits) console.log(`  ${line}`);
  }
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main();
}
