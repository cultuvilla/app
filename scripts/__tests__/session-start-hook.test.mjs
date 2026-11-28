import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = new URL('../../.claude/hooks/session-start.sh', import.meta.url).pathname;
const SETTINGS = new URL('../../.claude/settings.json', import.meta.url).pathname;

// A fake checkout plus a PATH of stubs that log each call. A stub "installs" by
// creating what the real command would, so the hook's next step sees it.
function run({ present = [], fail = [], files = ['package.json', 'functions/package.json'], dirs = ['packages/shared'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'session-start-'));
  const bin = mkdtempSync(join(tmpdir(), 'session-start-bin-'));
  const log = join(bin, 'calls.log');
  for (const f of files) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), '{}');
  }
  for (const d of [...dirs, ...present]) mkdirSync(join(root, d), { recursive: true });

  const stub = (name, makes) => {
    const body = [
      '#!/usr/bin/env bash',
      `echo "${name} $*" >> ${JSON.stringify(log)}`,
      ...(fail.includes(name) ? ['echo "boom" >&2', 'exit 1'] : []),
      ...makes,
    ].join('\n');
    writeFileSync(join(bin, name), body + '\n');
    chmodSync(join(bin, name), 0o755);
  };
  stub('pnpm', [
    'case "$1" in install) mkdir -p node_modules ;; shared:build) mkdir -p packages/shared/dist ;; esac',
  ]);
  stub('npm', ['mkdir -p functions/node_modules']);
  stub('git', ['exit 1']);

  const r = spawnSync('bash', [HOOK], {
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin`, CLAUDE_PROJECT_DIR: root },
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { ...r, calls };
}

const ALL = ['node_modules', 'functions/node_modules', 'packages/shared/dist'];

test('a checkout with its deps runs nothing and prints nothing', () => {
  const r = run({ present: ALL });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, []);
  assert.equal(r.stdout, '');
});

test('a bare checkout installs root, functions and the shared build, in that order', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 3);
  assert.match(r.calls[0], /^pnpm install --frozen-lockfile/);
  assert.match(r.calls[1], /^npm --prefix functions ci/);
  assert.equal(r.calls[2], 'pnpm shared:build');
  assert.equal(r.stdout.trim().split('\n').length, 1, 'exactly one line reaches the context');
  assert.match(r.stdout, /installed: deps functions shared\.$/m);
});

test('only the missing piece is installed', () => {
  const r = run({ present: ['node_modules', 'packages/shared/dist'] });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 1);
  assert.match(r.calls[0], /^npm --prefix functions ci/);
  assert.match(r.stdout, /installed: functions\.$/m);
});

test('a failed root install still lets the session start, and skips the shared build', () => {
  const r = run({ fail: ['pnpm'] });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /session-start: 'pnpm install .*' failed/);
  assert.ok(!r.calls.includes('pnpm shared:build'), r.calls.join('\n'));
  assert.match(r.stdout, /installed: functions \(failed: deps\)\.$/m);
});

test('outside a node project it does nothing', () => {
  const r = run({ files: [], dirs: [] });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.calls, []);
  assert.equal(r.stdout, '');
});

test('it never runs git', () => {
  for (const opts of [{}, { present: ALL }, { fail: ['pnpm', 'npm'] }]) {
    const r = run(opts);
    assert.ok(!r.calls.some((c) => c.startsWith('git')), r.calls.join('\n'));
  }
});

test('settings.json wires the hook at SessionStart and keeps the lander guard', () => {
  const { hooks } = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  const commands = (event) => (hooks[event] ?? []).flatMap((m) => m.hooks.map((h) => h.command));
  assert.deepEqual(commands('SessionStart'), ['$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh']);
  assert.ok(commands('PreToolUse').includes('$CLAUDE_PROJECT_DIR/.claude/hooks/guard-lander-kill.sh'));
});
