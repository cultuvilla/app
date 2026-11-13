import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../app-start-lan.sh', import.meta.url).pathname;

// A PATH holding only stubs (plus the shell basics), so the real powershell.exe
// that WSL interop puts on PATH can never leak into a case.
function run({ powershell, env = {} } = {}) {
  const bin = mkdtempSync(join(tmpdir(), 'app-start-lan-'));
  const stub = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub('pnpm', 'echo "pnpm $* host=${REACT_NATIVE_PACKAGER_HOSTNAME:-}"');
  if (powershell !== undefined) stub('powershell.exe', powershell);
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin`, ...env },
  });
}

test('advertises the detected Windows LAN IP under WSL', () => {
  const r = run({ powershell: "printf '192.168.1.131\\r\\n'" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pnpm --filter cultuvilla-mobile start host=192\.168\.1\.131$/m);
});

test('falls back to expo start --lan off WSL', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pnpm --filter cultuvilla-mobile start:lan host=$/m);
});

test('a failing powershell reaches the diagnostic instead of aborting silently', () => {
  const r = run({ powershell: 'echo boom >&2; exit 3' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not detect the Windows LAN IP/);
  assert.doesNotMatch(r.stdout, /pnpm/);
});

test('an empty detection fails loudly rather than advertising the WSL address', () => {
  const r = run({ powershell: "printf '\\r\\n'" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not detect the Windows LAN IP/);
});

test('a hostname from the environment is used as-is, DNS names included', () => {
  const r = run({ powershell: 'exit 1', env: { REACT_NATIVE_PACKAGER_HOSTNAME: 'mypc.local' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pnpm --filter cultuvilla-mobile start host=mypc\.local$/m);
});

// The start scripts themselves, under sh as pnpm runs them, with a stub expo.
const MOBILE_SCRIPTS = JSON.parse(
  readFileSync(new URL('../../apps/mobile/package.json', import.meta.url), 'utf8'),
).scripts;

for (const name of ['start', 'start:tunnel', 'start:lan']) {
  test(`${name} binds 8081 unless METRO_PORT moves it`, () => {
    const bin = mkdtempSync(join(tmpdir(), 'app-start-'));
    writeFileSync(join(bin, 'expo'), '#!/bin/sh\necho "$*"\n');
    chmodSync(join(bin, 'expo'), 0o755);
    const port = (env) =>
      spawnSync('sh', ['-c', MOBILE_SCRIPTS[name]], {
        encoding: 'utf8',
        env: { PATH: `${bin}:/usr/bin:/bin`, ...env },
      }).stdout.match(/--port (\S+)/)?.[1];
    assert.equal(port({}), '8081');
    assert.equal(port({ METRO_PORT: '' }), '8081');
    assert.equal(port({ METRO_PORT: '8090' }), '8090');
  });
}
