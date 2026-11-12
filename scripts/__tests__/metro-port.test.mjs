import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const SCRIPT = new URL('../metro-port.sh', import.meta.url).pathname;

const run = (base, env = {}) =>
  spawnSync('bash', [SCRIPT, String(base)], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', ...env },
  });

// Hold the given ports open on 127.0.0.1 while `fn` runs.
async function holding(ports, fn) {
  const servers = await Promise.all(
    ports.map(
      (port) =>
        new Promise((resolve, reject) => {
          const s = createServer();
          s.once('error', reject);
          s.listen(port, '127.0.0.1', () => resolve(s));
        }),
    ),
  );
  try {
    return fn();
  } finally {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  }
}

// A base well away from any real Metro, so a dev server on this machine never
// changes the outcome.
const BASE = 41000 + Math.floor(Math.random() * 900);
const series = Array.from({ length: 10 }, (_, i) => BASE + i * 10);

test('takes the base port when it is free', () => {
  const r = run(BASE);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), String(BASE));
});

test('skips taken ports, ten apart', async () => {
  await holding(series.slice(0, 2), () => {
    const r = run(BASE);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), String(BASE + 20));
  });
});

test('METRO_PORT wins even when the series is free', () => {
  const r = run(BASE, { METRO_PORT: '20123' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '20123');
});

test('an empty METRO_PORT means unset', () => {
  assert.equal(run(BASE, { METRO_PORT: '' }).stdout.trim(), String(BASE));
});

test('all ten taken fails loudly and prints no port', async () => {
  await holding(series, () => {
    const r = run(BASE);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, new RegExp(`${BASE}, ${BASE + 10} \\.\\.\\. ${BASE + 90}`));
  });
});
