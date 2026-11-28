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

function listen(port) {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

const close = (servers) => Promise.all(servers.map((s) => new Promise((r) => s.close(r))));

// Hold the given ports open on 127.0.0.1 while `fn` runs. A port that fails to
// bind closes the ones already bound before rethrowing: a server left listening
// keeps this file's process alive, and `node --test` then waits on it forever
// (CI's emulator job hung to its 25-minute limit three times on 2026-11-28).
async function holding(ports, fn) {
  const results = await Promise.allSettled(ports.map(listen));
  const servers = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) {
    await close(servers);
    throw failed.reason;
  }
  try {
    return fn();
  } finally {
    await close(servers);
  }
}

// A series nothing on the machine holds right now, below Linux's ephemeral
// range (32768+) so no outgoing connection's source port lands in it — and a
// probe of a free port can never connect to itself.
async function freeBase() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const base = 30000 + Math.floor(Math.random() * 1900);
    const ports = Array.from({ length: 10 }, (_, i) => base + i * 10);
    try {
      await holding(ports, () => {});
      return base;
    } catch {
      // taken — try another
    }
  }
  throw new Error('no free port series in 30000-31999');
}

const BASE = await freeBase();
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

test('a port that cannot be held releases the ones already bound', async () => {
  const taken = await listen(BASE + 5);
  try {
    await assert.rejects(holding([BASE + 15, BASE + 5], () => {}), { code: 'EADDRINUSE' });
  } finally {
    await close([taken]);
  }
  await close([await listen(BASE + 15)]);
});
