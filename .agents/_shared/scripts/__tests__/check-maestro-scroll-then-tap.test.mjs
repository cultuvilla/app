// Run with: node --test scripts/__tests__/check-maestro-scroll-then-tap.test.mjs
//
// Guards the settle between a `scrollUntilVisible` and the `tapOn` of the same
// element. Without it the tap lands on a list that is still gliding, Android
// spends it stopping the fling, and the flow dies one step later on a wait for a
// screen that never opened — two release-PR flows, 2026-09-30.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '../check-maestro-scroll-then-tap.js');

function run(dir) {
  try {
    const out = execFileSync('node', [SCRIPT, `--dir=${dir}`], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

function checkFlow(commands) {
  const dir = mkdtempSync(path.join(tmpdir(), 'maestro-scroll-tap-'));
  try {
    mkdirSync(path.join(dir, 'regressions'));
    writeFileSync(path.join(dir, 'regressions', 'flow.yaml'), `appId: \${APP_ID}\n---\n${commands}`);
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const scroll = (id, extra = '') => `- scrollUntilVisible:
    element:
      id: "${id}"
    direction: DOWN
${extra}    timeout: 20000
`;
const tap = (id) => `- tapOn:
    id: "${id}"
`;
const settle = `- waitForAnimationToEnd:
    timeout: 5000
`;

test('a scroll straight into a tap on the same element is reported', () => {
  const { code, out } = checkFlow(scroll('card-a') + tap('card-a'));
  assert.equal(code, 1);
  assert.match(out, /regressions\/flow\.yaml/);
  assert.match(out, /card-a/);
});

test('centerElement alone does not pass: the list is still moving when it stops', () => {
  const { code } = checkFlow(scroll('card-a', '    centerElement: true\n') + tap('card-a'));
  assert.equal(code, 1);
});

test('centred and settled passes', () => {
  const { code } = checkFlow(scroll('card-a', '    centerElement: true\n') + settle + tap('card-a'));
  assert.equal(code, 0);
});

test('settled without centring passes — the settle is the half this check demands', () => {
  const { code } = checkFlow(scroll('card-a') + settle + tap('card-a'));
  assert.equal(code, 0);
});

test('a tap on a different element than the one scrolled to is out of scope', () => {
  const { code } = checkFlow(scroll('state-default') + tap('propose-button'));
  assert.equal(code, 0);
});

test('a text selector on both sides is matched too', () => {
  const { code, out } = checkFlow(`- scrollUntilVisible:
    element: "Ver todo"
    direction: DOWN
- tapOn: "Ver todo"
`);
  assert.equal(code, 1);
  assert.match(out, /Ver todo/);
});

test('the race is found inside a nested runFlow commands block', () => {
  const { code } = checkFlow(`- runFlow:
    when:
      visible:
        id: "hub-list"
    commands:
${(scroll('card-a') + tap('card-a')).replace(/^/gm, '      ')}`);
  assert.equal(code, 1);
});

test('comments between the scroll and the tap do not hide the race', () => {
  const { code } = checkFlow(`${scroll('card-a')}# Tap the checkbox itself, not the row.\n${tap('card-a')}`);
  assert.equal(code, 1);
});

test('a flow the YAML reader cannot read fails, naming the file — never a silent skip', () => {
  const { code, out } = checkFlow(`- scrollUntilVisible: &s
    element:
      id: "card-a"
- tapOn: *s
`);
  assert.equal(code, 1);
  assert.match(out, /regressions\/flow\.yaml: cannot read it/);
  assert.match(out, /anchors, aliases and tags are not supported/);
});

test('the flows directory comes from the repo config, and may be a list', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'maestro-config-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    mkdirSync(path.join(dir, '.agents'));
    mkdirSync(path.join(dir, 'e2e', 'flows'), { recursive: true });
    mkdirSync(path.join(dir, 'e2e', 'subflows'), { recursive: true });
    writeFileSync(path.join(dir, '.agents', 'checks.config.json'), JSON.stringify({ maestro: { flowsDir: ['e2e/flows', 'e2e/subflows'] } }));
    writeFileSync(path.join(dir, 'e2e', 'flows', 'ok.yaml'), settle);
    writeFileSync(path.join(dir, 'e2e', 'subflows', 'bad.yaml'), scroll('card-a') + tap('card-a'));
    let res;
    try {
      res = { code: 0, out: execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (err) {
      res = { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
    assert.equal(res.code, 1, res.out);
    assert.match(res.out, /e2e\/subflows\/bad\.yaml/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
