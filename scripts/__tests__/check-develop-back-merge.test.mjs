// The develop back-merge guard, through throwaway git repos: the verdict is
// pure ancestry, so it is tested on real history rather than mocked output.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findBackMerges, main, resolveCheck } from '../check-develop-back-merge.mjs';

const tmp = [];
after(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'back-merge-'));
  tmp.push(dir);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    }).trim();
  git('init', '-q', '-b', 'develop');
  let n = 0;
  const commit = (msg) => {
    writeFileSync(path.join(dir, `f${n++}`), msg);
    git('add', '.');
    git('commit', '-q', '-m', msg);
    return git('rev-parse', 'HEAD');
  };
  const merge = (ref, msg) => {
    git('merge', '-q', '--no-ff', '-m', msg, ref);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, commit, merge };
}

/**
 * develop: A ─ B ─ C
 * release/1 from B merges main → beta; beta → main (merge commits develop never gets).
 * release/2 from C does the same, so C is on beta and main too.
 */
function releasedHistory() {
  const r = repo();
  r.commit('A');
  r.git('branch', 'main');
  r.git('branch', 'beta');
  r.commit('B');
  for (const [release, tip] of [
    ['release/1', 'develop'],
    ['release/2', null],
  ]) {
    if (tip === null) {
      r.git('checkout', '-q', 'develop');
      r.commit('C');
    }
    r.git('checkout', '-q', '-b', release, 'develop');
    r.merge('main', `Merge main into ${release}`);
    r.git('checkout', '-q', 'beta');
    r.merge(release, `Merge ${release} into beta`);
    r.git('checkout', '-q', 'main');
    r.merge('beta', 'Merge beta into main');
  }
  r.git('checkout', '-q', 'develop');
  return r;
}

const branches = ['beta', 'main'];

describe('findBackMerges', () => {
  let r;
  before(() => {
    r = releasedHistory();
  });

  it('passes a feature branch cut from develop', () => {
    r.git('checkout', '-q', '-b', 'feat/plain', 'develop');
    r.commit('feature');
    assert.deepEqual(findBackMerges({ base: 'develop', head: 'HEAD', branches, cwd: r.dir }), []);
  });

  it('passes a feature branch that merged develop in, though those commits are on beta and main', () => {
    r.git('checkout', '-q', '-b', 'feat/old', 'develop~1');
    r.commit('feature');
    r.merge('develop', 'Merge develop into feat/old');
    assert.deepEqual(findBackMerges({ base: 'develop', head: 'HEAD', branches, cwd: r.dir }), []);
  });

  for (const source of ['main', 'beta', 'release/2']) {
    it(`fails a branch that merged ${source}`, () => {
      r.git('checkout', '-q', '-b', `feat/merges-${source}`, 'develop');
      r.commit('feature');
      r.merge(source, `Merge ${source}`);
      const offenders = findBackMerges({
        base: 'develop',
        head: 'HEAD',
        branches,
        cwd: r.dir,
      });
      assert.ok(offenders.length > 0, 'expected a back-merge');
      assert.ok(offenders.some((o) => o.commits.some((c) => /Merge (main|release\/2) into/.test(c))));
    });
  }

  it('fails develop itself fast-forwarded onto main', () => {
    assert.ok(findBackMerges({ base: 'develop', head: 'main', branches, cwd: r.dir }).length > 0);
  });

  it('throws when a protected branch is missing, instead of passing', () => {
    assert.throws(
      () =>
        findBackMerges({
          base: 'develop',
          head: 'develop',
          branches: ['nope'],
          cwd: r.dir,
        }),
      /nope is not a commit here/,
    );
  });
});

describe('resolveCheck', () => {
  it('checks a pull request into develop against its merge ref first parent', () => {
    assert.deepEqual(resolveCheck({ eventName: 'pull_request', baseRef: 'develop' }), { base: 'HEAD^1', head: 'HEAD' });
  });

  it('skips pull requests into beta and main, where release history belongs', () => {
    assert.ok('skip' in resolveCheck({ eventName: 'pull_request', baseRef: 'beta' }));
    assert.ok('skip' in resolveCheck({ eventName: 'pull_request', baseRef: 'main' }));
  });

  it('checks a develop merge-queue commit against the queue base', () => {
    const event = {
      merge_group: {
        base_ref: 'refs/heads/develop',
        base_sha: 'abc',
        head_ref: 'refs/heads/gh-readonly-queue/develop/pr-1-abc',
      },
    };
    assert.deepEqual(resolveCheck({ eventName: 'merge_group', event }), {
      base: 'abc',
      head: 'HEAD',
    });
  });

  it('skips a merge queue for another branch, and refuses one with no base', () => {
    assert.ok(
      'skip' in
        resolveCheck({
          eventName: 'merge_group',
          event: { merge_group: { base_ref: 'refs/heads/beta' } },
        }),
    );
    assert.throws(() =>
      resolveCheck({
        eventName: 'merge_group',
        event: { merge_group: { base_ref: 'refs/heads/develop' } },
      }),
    );
  });

  it('checks a push to develop from its previous tip', () => {
    assert.deepEqual(
      resolveCheck({
        eventName: 'push',
        ref: 'refs/heads/develop',
        event: { before: 'def' },
      }),
      {
        base: 'def',
        head: 'HEAD',
      },
    );
    assert.ok(
      'skip' in
        resolveCheck({
          eventName: 'push',
          ref: 'refs/heads/develop',
          event: { before: '0'.repeat(40) },
        }),
    );
    assert.ok(
      'skip' in
        resolveCheck({
          eventName: 'push',
          ref: 'refs/heads/main',
          event: { before: 'def' },
        }),
    );
  });
});

describe('main --ci', () => {
  const silence = (fn) => {
    const log = console.log;
    console.log = () => {};
    try {
      return fn();
    } finally {
      console.log = log;
    }
  };

  function ciClone(source, checkout) {
    const dir = mkdtempSync(path.join(tmpdir(), 'back-merge-ci-'));
    tmp.push(dir);
    execFileSync('git', ['clone', '-q', '--depth=1', '--no-local', `file://${source.dir}`, '-b', checkout, dir], {
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      stdio: 'ignore',
    });
    return dir;
  }

  function prEvent(dir) {
    const eventPath = path.join(dir, '..', `${path.basename(dir)}-event.json`);
    writeFileSync(eventPath, '{}');
    tmp.push(eventPath);
    return {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'develop',
      GITHUB_EVENT_PATH: eventPath,
    };
  }

  it('fetches beta and main into a shallow pull-request checkout and passes a clean merge ref', () => {
    const r = releasedHistory();
    r.git('checkout', '-q', '-b', 'feat/x', 'develop');
    r.commit('feature');
    r.git('checkout', '-q', '-b', 'pr-merge', 'develop');
    r.merge('feat/x', 'Merge feat/x into develop');
    const dir = ciClone(r, 'pr-merge');
    assert.equal(
      silence(() => main(['--ci'], prEvent(dir), dir)),
      0,
    );
  });

  it('fails a merge ref that brings main in', () => {
    const r = releasedHistory();
    r.git('checkout', '-q', '-b', 'feat/x', 'develop');
    r.merge('main', 'Merge main into feat/x');
    r.git('checkout', '-q', '-b', 'pr-merge', 'develop');
    r.merge('feat/x', 'Merge feat/x into develop');
    const dir = ciClone(r, 'pr-merge');
    assert.equal(
      silence(() => main(['--ci'], prEvent(dir), dir)),
      1,
    );
  });

  it('is a no-op, touching no git, for a pull request into beta', () => {
    const env = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'beta' };
    assert.equal(
      silence(() => main(['--ci'], env, '/nonexistent')),
      0,
    );
  });
});
