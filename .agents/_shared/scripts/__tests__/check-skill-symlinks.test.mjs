// Regression tests for scripts/check-skill-symlinks.js.
//
// The guard exists because 3788aba7 pointed both shared-skill symlinks one path
// segment short of their content, making them unloadable AS COMMITTED for a day
// without anything noticing. These tests pin the outcomes that matter, so the
// guard cannot be quietly reverted into uselessness:
//
//   1. every link resolves                   -> exit 0
//   2. a link is broken, submodule populated  -> exit 1, "wrong as committed"
//   3. a link is broken, submodule ABSENT     -> exit 1, "run git submodule update --init"
//   4. a skill DIRECTORY itself does not resolve -> exit 1, even if the other view is fine
//
// (2) and (3) are the pair worth pinning: they look identical from the outside
// (a dangling symlink either way) and want opposite responses — fix the commit
// vs fix your checkout. Collapsing them would send someone chasing the wrong
// one, which is exactly what happened before the guard existed.
//
// Fixture trees are built in a temp dir rather than against the real repo, so
// the tests are independent of whether THIS checkout's submodule is populated.
//
// Run with: node --test scripts/__tests__/check-skill-symlinks.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { inspectSkillSymlinks, report } = require('../check-skill-symlinks.js');

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Build a throwaway repo-shaped tree.
 * `populated` controls whether .agents/_shared/skills exists;
 * `links` maps a skill name to the target its symlink should carry.
 */
function fixture({ populated, links }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-symlinks-'));
  fs.mkdirSync(path.join(root, '.agents/skills'), { recursive: true });

  if (populated) {
    for (const name of Object.keys(links)) {
      fs.mkdirSync(path.join(root, '.agents/_shared/skills', name), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(root, '.agents/_shared/skills', name, 'SKILL.md'),
        '# stub\n'
      );
    }
  }

  for (const [name, target] of Object.entries(links)) {
    fs.symlinkSync(target, path.join(root, '.agents/skills', name));
  }
  return root;
}

const capture = () => {
  const lines = [];
  return { sink: { log: (m) => lines.push(m), error: (m) => lines.push(m) }, lines };
};

test('all links resolve -> clean result and exit 0', () => {
  const root = fixture({
    populated: true,
    links: { 'ship-a-feature': '../_shared/skills/ship-a-feature' },
  });

  const result = inspectSkillSymlinks(root, ['.agents/skills']);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.broken, []);
  assert.equal(result.submodulePopulated, true);

  const { sink, lines } = capture();
  assert.equal(report(result, sink), 0);
  assert.match(lines.join('\n'), /1 resolve/);
});

test('the exact 3788aba7 shape — one segment short — is caught as a committed defect', () => {
  const root = fixture({
    populated: true,
    // the real bug: content is at ../_shared/skills/<name>, link says ../_shared/<name>
    links: { 'ship-a-feature': '../_shared/ship-a-feature' },
  });

  const result = inspectSkillSymlinks(root, ['.agents/skills']);
  assert.equal(result.checked, 1);
  assert.equal(result.broken.length, 1);
  assert.equal(result.broken[0].target, '../_shared/ship-a-feature');
  assert.equal(result.submodulePopulated, true);

  const { sink, lines } = capture();
  assert.equal(report(result, sink), 1);
  const out = lines.join('\n');
  assert.match(out, /wrong as committed/);
  assert.doesNotMatch(
    out,
    /submodule update --init/,
    'a populated submodule must NOT be reported as a checkout problem — that sends the reader to the wrong fix'
  );
});

test('the same broken link without the submodule is reported as a local checkout problem', () => {
  const root = fixture({
    populated: false,
    links: { 'ship-a-feature': '../_shared/skills/ship-a-feature' },
  });

  const result = inspectSkillSymlinks(root, ['.agents/skills']);
  assert.equal(result.broken.length, 1);
  assert.equal(result.submodulePopulated, false);

  const { sink, lines } = capture();
  assert.equal(report(result, sink), 1);
  const out = lines.join('\n');
  assert.match(out, /submodule update --init/);
  assert.doesNotMatch(
    out,
    /wrong as committed/,
    'an uninitialised submodule is not a committed defect'
  );
});

test('a broken .claude/skills DIRECTORY symlink fails, even though .agents/skills resolves', () => {
  // .claude/skills is itself a symlink (-> ../.agents/skills). Skipping an
  // unresolvable skill dir would let this break pass unnoticed because the
  // other view is fine — one whole documented skill view silently unloadable.
  const root = fixture({
    populated: true,
    links: { 'ship-a-feature': '../_shared/skills/ship-a-feature' },
  });
  fs.mkdirSync(path.join(root, '.claude'));
  fs.symlinkSync('../.agents/skillz', path.join(root, '.claude/skills')); // typo'd target

  const result = inspectSkillSymlinks(root);
  assert.deepEqual(result.broken, [], 'the links inside the resolvable view are fine');
  assert.equal(result.missingDirs.length, 1);
  assert.equal(result.missingDirs[0].dir, '.claude/skills');
  assert.equal(result.missingDirs[0].target, '../.agents/skillz');

  const { sink, lines } = capture();
  assert.equal(report(result, sink), 1, 'a whole unloadable view must fail the guard');
  assert.match(lines.join('\n'), /\.claude\/skills does not resolve/);
});

test('a non-symlink entry is not counted', () => {
  const root = fixture({ populated: true, links: {} });
  fs.mkdirSync(path.join(root, '.agents/skills/local-skill'));
  fs.writeFileSync(path.join(root, '.agents/skills/local-skill/SKILL.md'), '# x\n');

  const result = inspectSkillSymlinks(root, ['.agents/skills']);
  assert.equal(result.checked, 0, 'real directories are skills too, but not this check’s business');
  assert.deepEqual(result.broken, []);
});

test('the CLI reads the consuming repo from the working directory, and its configured dirs', () => {
  // Consumers run this through a symlink into .agents/_shared, so the repo it
  // checks must come from the cwd — never from the script's own location.
  const root = fixture({ populated: true, links: {} });
  spawnSync('git', ['init', '-q'], { cwd: root });
  fs.mkdirSync(path.join(root, '.agents/_shared/skills'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'));
  fs.symlinkSync('../.agents/_shared/scripts/gone.js', path.join(root, 'bin/gone.js'));
  const cli = () => spawnSync(process.execPath, [path.join(scriptsDir, 'check-skill-symlinks.js')], { cwd: root, encoding: 'utf8' });

  const config = (cfg) => fs.writeFileSync(path.join(root, '.agents/checks.config.json'), JSON.stringify({ skillSymlinks: cfg }));
  assert.equal(cli().status, 1, 'the default .claude/skills view is missing from the fixture');
  config({ skillDirs: ['.agents/skills'] });
  const ok = cli();
  assert.equal(ok.status, 0, `bin/ is not a link dir until the config says so: ${ok.stderr}`);
  fs.writeFileSync(path.join(root, '.agents/checks.config.json'), JSON.stringify({ skillSymlinks: { skillDirs: ['.agents/skills'], linkDirs: ['bin'] } }));
  const r = cli();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /bin\/gone\.js/);
});

test('a dangling hook or script link into the submodule fails the guard', () => {
  // A PreToolUse hook whose command does not exist is a non-blocking error,
  // not a deny — guard-lander-kill would vanish without a word.
  const root = fixture({ populated: true, links: {} });
  fs.mkdirSync(path.join(root, '.agents/_shared/scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/_shared/scripts/pr-land.js'), '// stub\n');
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.symlinkSync('../.agents/_shared/scripts/pr-land.js', path.join(root, 'scripts/pr-land.js'));
  fs.mkdirSync(path.join(root, '.claude/hooks'), { recursive: true });
  fs.symlinkSync('../../.agents/_shared/hooks/guard-lander-kill.sh', path.join(root, '.claude/hooks/guard-lander-kill.sh'));

  const result = inspectSkillSymlinks(root, ['.agents/skills']);
  assert.equal(result.checked, 2, 'the script and the hook link are both inspected');
  assert.deepEqual(
    result.broken.map((b) => b.link),
    [path.join('.claude/hooks', 'guard-lander-kill.sh')]
  );
  const { sink } = capture();
  assert.equal(report(result, sink), 1);
});
