// Tests for scripts/prune-merged-worktrees.sh: it removes only a worktree that is
// clean AND whose branch is on origin/<base>, under <worktreesDir> only, and is a
// dry run unless --apply.
//
// Run with: node --test scripts/__tests__/prune-merged-worktrees.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'prune-merged-worktrees.sh');
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.email=t@x', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

// A main checkout on <base> with an origin, and three worktrees: merged+clean,
// merged+dirty, unmerged.
function fixture({ base = 'develop', worktreesDir = '.claude/worktrees', config = false } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prune-')));
  const origin = path.join(tmp, 'origin.git');
  const root = path.join(tmp, 'main');
  git(tmp, 'init', '-q', '--bare', '-b', base, origin);
  git(tmp, 'clone', '-q', origin, root);
  git(root, 'checkout', '-q', '-b', base);
  if (config) {
    fs.mkdirSync(path.join(root, '.agents'));
    fs.writeFileSync(path.join(root, '.agents/land.config.json'), JSON.stringify({ baseBranch: base }));
    fs.writeFileSync(path.join(root, '.agents/orchestrate.config.json'), JSON.stringify({ worktreesDir }));
    git(root, 'add', '.agents');
  }
  git(root, 'commit', '-q', '--allow-empty', '-m', 'base');
  git(root, 'push', '-q', 'origin', base);
  const add = (name, branch) => {
    const wt = path.join(root, worktreesDir, name);
    git(root, 'worktree', 'add', '-q', '-b', branch, wt, `origin/${base}`);
    fs.writeFileSync(path.join(wt, `${name}.txt`), 'x\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-q', '-m', name);
    return wt;
  };
  const merged = add('merged', 'feat/merged');
  const dirty = add('dirty', 'feat/dirty');
  const unmerged = add('unmerged', 'feat/unmerged');
  git(root, 'merge', '-q', '--no-ff', '-m', 'm1', 'feat/merged');
  git(root, 'merge', '-q', '--no-ff', '-m', 'm2', 'feat/dirty');
  git(root, 'push', '-q', 'origin', base);
  fs.writeFileSync(path.join(dirty, 'wip.txt'), 'unsaved\n');
  return { root, merged, dirty, unmerged };
}

const prune = (cwd, ...args) => spawnSync('bash', [SCRIPT, ...args], { cwd, encoding: 'utf8' });

test('a dry run removes nothing and says what it would do', () => {
  const f = fixture();
  const r = prune(f.root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /WOULD\s+merged/);
  assert.match(r.stdout, /KEEP\s+dirty .*uncommitted/);
  assert.match(r.stdout, /KEEP\s+unmerged .*not on develop/);
  assert.ok(fs.existsSync(f.merged));
});

test('--apply removes only the clean, merged worktree — from inside a worktree too', () => {
  const f = fixture();
  const r = prune(f.unmerged, '--apply');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(f.merged));
  assert.ok(fs.existsSync(path.join(f.dirty, 'wip.txt')), 'a dirty worktree keeps its work');
  assert.ok(fs.existsSync(f.unmerged));
  assert.match(git(f.root, 'branch', '--list', 'feat/merged'), /feat\/merged/, 'the branch is kept');
});

test('base branch and worktrees dir come from the repo config', () => {
  const f = fixture({ base: 'main', worktreesDir: 'wt', config: true });
  const r = prune(f.root, '--apply');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not on main/);
  assert.ok(!fs.existsSync(f.merged));
});

test('a worktree outside the worktrees dir is never touched', () => {
  const f = fixture();
  const outside = path.join(path.dirname(f.root), 'sibling');
  git(f.root, 'worktree', 'add', '-q', '-b', 'feat/sibling', outside, 'origin/develop');
  const r = prune(f.root, '--apply');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(outside));
  assert.doesNotMatch(r.stdout, /sibling/);
});
