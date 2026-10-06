// The release-time rollup of `Breaking-Client:` trailers: pure parsing, then end
// to end through a throwaway git repo, since every past false positive of the
// PR-time guards was a range bug rather than a parsing bug.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  breakingSinceLastRelease,
  compareVersions,
  previousReleaseTag,
  rollupBreaking,
} from '../lib/breaking-rollup.mjs';

describe('previousReleaseTag', () => {
  it('picks the highest release tag strictly below the version', () => {
    assert.equal(previousReleaseTag(['v1.4.1', 'v1.5.0', 'v1.2.0', 'v1.10.0'], '1.11.0'), 'v1.10.0');
    assert.equal(previousReleaseTag(['v1.4.1', 'v1.5.0'], '1.6.0'), 'v1.5.0');
  });

  // deploy-prod's tag job writes v<version> on this very commit once the deploy
  // is green; a re-run measured against it would find nothing.
  it('never measures a release against its own tag', () => {
    assert.equal(previousReleaseTag(['v1.5.0', 'v1.6.0'], '1.6.0'), 'v1.5.0');
  });

  it('ignores anything that is not a bare vX.Y.Z', () => {
    assert.equal(previousReleaseTag(['v1.5.0-rc1', 'release-1.5.0', 'v1.4.0'], '1.6.0'), 'v1.4.0');
  });

  it('returns null when there is nothing earlier', () => {
    assert.equal(previousReleaseTag(['v2.0.0'], '1.0.0'), null);
    assert.equal(previousReleaseTag([], '1.0.0'), null);
  });
});

describe('rollupBreaking', () => {
  it('walls at this version when any commit declares Breaking-Client', () => {
    const r = rollupBreaking(['feat: a', 'refactor: b\n\nBreaking-Client: drops acceptInvite v1'], '1.6.0');
    assert.deepEqual(r, { breaking: true, reasons: ['drops acceptInvite v1'], minSupported: '1.6.0' });
  });

  // Exempt satisfies the CI guards precisely because it strands nobody.
  it('ignores Breaking-Client-Exempt', () => {
    const r = rollupBreaking(['chore: x\n\nBreaking-Client-Exempt: last called in 1.1.0'], '1.6.0');
    assert.deepEqual(r, { breaking: false, reasons: [], minSupported: null });
  });

  it('reports each reason once', () => {
    const r = rollupBreaking(['a\n\nBreaking-Client: same', 'b\n\nBreaking-Client: same'], '1.6.0');
    assert.deepEqual(r.reasons, ['same']);
  });
});

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
    assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
  });

  it('throws on a non-semver value rather than guessing', () => {
    assert.throws(() => compareVersions('1.2', '1.2.0'), /MAJOR\.MINOR\.PATCH/);
  });
});

describe('breakingSinceLastRelease (real git)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rollup-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = (msg) => {
    writeFileSync(path.join(dir, 'f.txt'), `${msg}\n${Math.random()}`);
    git('add', '.');
    git('commit', '-q', '-m', msg);
  };

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  commit('feat: old\n\nBreaking-Client: shipped long ago');
  git('tag', 'v1.5.0');
  commit('feat: new thing');
  commit('refactor: contract\n\nBreaking-Client: removes the v1 callable');
  git('checkout', '-q', '-b', 'side');
  commit('docs: describes the trailer\n\nBreaking-Client: only in a merged branch');
  git('checkout', '-q', 'main');
  // A merge commit whose message carries the trailer text, as a PR body would.
  git('merge', '-q', '--no-ff', 'side', '-m', 'Merge pull request #1\n\nBreaking-Client: from a PR description');

  it('reads every non-merge commit since the previous release tag', () => {
    const r = breakingSinceLastRelease({ version: '1.6.0', cwd: dir });
    assert.equal(r.base, 'v1.5.0');
    assert.equal(r.breaking, true);
    assert.deepEqual(r.reasons.sort(), ['only in a merged branch', 'removes the v1 callable']);
  });

  it('does not reach behind the previous tag', () => {
    const r = breakingSinceLastRelease({ version: '1.6.0', cwd: dir });
    assert.ok(!r.reasons.includes('shipped long ago'));
  });

  it('still measures from the previous tag once this release is tagged too', () => {
    git('tag', 'v1.6.0');
    const r = breakingSinceLastRelease({ version: '1.6.0', cwd: dir });
    assert.equal(r.base, 'v1.5.0');
    assert.equal(r.breaking, true);
  });

  it('is not breaking with no earlier release to measure against', () => {
    const r = breakingSinceLastRelease({ version: '1.0.0', cwd: dir });
    assert.equal(r.base, null);
    assert.equal(r.breaking, false);
  });
});
