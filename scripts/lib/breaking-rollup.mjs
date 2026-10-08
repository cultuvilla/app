/**
 * Is a release breaking? — the release-time half of the `Breaking-Client:`
 * trailer. The PR-time half (scripts/lib/breaking-change.mjs) makes a breaking
 * change declare itself; this reads those declarations back across a whole
 * release and turns them into a wall: once the release is live in both stores,
 * `config/appVersion.minSupported` becomes this version.
 *
 * Only `Breaking-Client:` counts. `Breaking-Client-Exempt:` satisfies the CI
 * guards precisely because it strands nobody, so it must never move the wall.
 *
 * Pure parsing + one git helper at the bottom. See
 * docs/decisions/announce-when-live-poller.md.
 */

import { execFileSync } from 'node:child_process';
import { parseBreakingTrailers } from './breaking-change.mjs';

const RELEASE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** -1 / 0 / 1 for two `MAJOR.MINOR.PATCH` strings. Throws on anything else. */
export function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
    if (!m) throw new Error(`not a MAJOR.MINOR.PATCH version: "${v}"`);
    return m.slice(1).map(Number);
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * The release this one is measured against: the highest `vX.Y.Z` tag strictly
 * below `version`. Strictly below, because deploy-prod's `tag` job writes
 * `v<version>` onto this very commit once the backend is green — and a re-run,
 * or a hotfix push of the same version, would otherwise diff against itself and
 * find nothing. `tags` should be the tags reachable from HEAD.
 */
export function previousReleaseTag(tags, version) {
  let best = null;
  for (const tag of tags ?? []) {
    const m = RELEASE_TAG.exec(String(tag).trim());
    if (!m) continue;
    const v = m.slice(1).join('.');
    if (compareVersions(v, version) >= 0) continue;
    if (!best || compareVersions(v, best.version) > 0) best = { tag: String(tag).trim(), version: v };
  }
  return best?.tag ?? null;
}

/** `{ breaking, reasons, minSupported }` for a release's commit messages. */
export function rollupBreaking(commitMessages, version) {
  const reasons = [...new Set(parseBreakingTrailers(commitMessages))];
  const breaking = reasons.length > 0;
  return { breaking, reasons, minSupported: breaking ? version : null };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
}

/**
 * Roll up `<previous release tag>..<head>` in a git checkout.
 *
 * Merge commits are skipped: `gh pr merge` writes the PR title and body into
 * them, and a PR body that merely *describes* the trailer (this file's own PR
 * did) would wall the fleet. The trailer is binding only on the commit that
 * makes the change, which is where the CI guards read it too.
 *
 * Needs full history and tags (`fetch-depth: 0`). No previous tag at all means
 * there is nothing to measure against, which is reported as `base: null` and
 * read as non-breaking — a first release strands no installed client.
 */
export function breakingSinceLastRelease({ version, head = 'HEAD', cwd = process.cwd() }) {
  const tags = git(['tag', '--merged', head, '--list', 'v*'], cwd).split('\n').filter(Boolean);
  const base = previousReleaseTag(tags, version);
  if (!base) return { base: null, ...rollupBreaking([], version) };
  const log = git(['log', '--no-merges', '--format=%B%x1e', `${base}..${head}`], cwd);
  const messages = log.split('\x1e').map((m) => m.trim()).filter(Boolean);
  return { base, commits: messages.length, ...rollupBreaking(messages, version) };
}

/**
 * The `Breaking-Client:` trailers a single merge brings in: `HEAD^1..HEAD`, the
 * commits the previous tip lacked. Beta uses it, since beta has no release
 * tags: a beta version is breaking for the beta app when its own merge carries
 * a trailer. A root commit (no parent) reads as nothing breaking.
 */
export function breakingInMerge({ version, head = 'HEAD', cwd = process.cwd() }) {
  let base;
  try {
    base = git(['rev-parse', '--verify', `${head}^1`], cwd).trim();
  } catch {
    return { base: null, ...rollupBreaking([], version) };
  }
  const log = git(['log', '--no-merges', '--format=%B%x1e', `${base}..${head}`], cwd);
  const messages = log.split('\x1e').map((m) => m.trim()).filter(Boolean);
  return { base, commits: messages.length, ...rollupBreaking(messages, version) };
}
