/**
 * `scripts/dev-client-rollout.sh` against stub devices. adb, emulator and the
 * gradle build are replaced by small scripts that keep their state in a temp
 * dir and log every call, so each test asserts what the rollout actually did to
 * which device — and that another repo's emulator was never touched.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'dev-client-rollout.sh');
const PIXEL = '192.168.1.135:37000';

/**
 * A machine with stub tools. `running` maps an emulator serial to its AVD name;
 * `phones` are attached physical serials; `avds` exist; `installs` maps a
 * serial to `ok` | `mismatch` | `fail` (a mismatch clears on uninstall).
 */
const machine = ({ phones = [], running = {}, avds = [], installs = {}, apkEntries = ['classes.dex'] } = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cv-rollout-'));
  const sdk = path.join(dir, 'sdk');
  const bin = path.join(dir, 'bin');
  const state = path.join(dir, 'state');
  for (const d of [path.join(sdk, 'platform-tools'), path.join(sdk, 'emulator'), bin, state]) mkdirSync(d, { recursive: true });
  writeFileSync(path.join(state, 'devices'), [...phones, ...Object.keys(running)].map((d) => `${d}\n`).join(''));
  for (const [serial, avd] of Object.entries(running)) writeFileSync(path.join(state, `avd-${serial}`), avd);
  writeFileSync(path.join(state, 'avds'), avds.map((a) => `${a}\n`).join(''));
  for (const [serial, outcome] of Object.entries(installs)) writeFileSync(path.join(state, `install-${serial}`), outcome);
  writeFileSync(path.join(state, 'log'), '');
  const executable = (file, body) => {
    writeFileSync(file, `#!/usr/bin/env bash\nset -u\nSTATE=${JSON.stringify(state)}\n${body}\n`);
    chmodSync(file, 0o755);
  };

  executable(path.join(sdk, 'platform-tools', 'adb'), String.raw`
echo "adb $* serial_env=$${'{'}ANDROID_SERIAL:-}" >> "$STATE/log"
if [[ "$1" == devices ]]; then echo "List of devices attached"; sed 's/$/\tdevice/' "$STATE/devices"; exit 0; fi
[[ "$1" == -s ]] || { echo "error: more than one device/emulator" >&2; exit 1; }
serial="$2"; shift 2
case "$1" in
  emu) cat "$STATE/avd-$serial"; echo; echo OK ;;
  shell) echo "Pixel 8" ;;
  uninstall) echo ok > "$STATE/install-$serial" ;;
  install)
    outcome="$(cat "$STATE/install-$serial" 2>/dev/null || echo ok)"
    case "$outcome" in
      ok) echo Success ;;
      mismatch) echo "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match]"; exit 1 ;;
      *) echo "Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]"; exit 1 ;;
    esac ;;
  *) echo "unexpected adb $*" >> "$STATE/log"; exit 1 ;;
esac`);
  executable(path.join(sdk, 'emulator', 'emulator'), String.raw`[[ "$1" == -list-avds ]] && cat "$STATE/avds"`);
  executable(path.join(bin, 'build'), apkEntries === null ? 'echo build >> "$STATE/log"; echo "not a zip" > "$1"' : `echo "build" >> "$STATE/log"
python3 -c 'import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as z:
    for name in sys.argv[2:]: z.writestr(name, "x")' "$1" ${apkEntries.map((e) => JSON.stringify(e)).join(' ')}`);

  const run = (args = [], fingerprint = 'fp-1') =>
    spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ANDROID_HOME: sdk,
        ANDROID_SERIAL: 'emulator-5554',
        XDG_CACHE_HOME: path.join(dir, 'cache'),
        ROLLOUT_FINGERPRINT: fingerprint,
        ROLLOUT_BUILD: path.join(bin, 'build'),
      },
    });
  const log = () => readFileSync(path.join(state, 'log'), 'utf8').trim().split('\n').filter(Boolean);
  const clearLog = () => writeFileSync(path.join(state, 'log'), '');
  const rolledOut = () => {
    const file = path.join(dir, 'cache', 'cultuvilla', 'dev-client', 'rolled-out-fingerprint');
    return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
  };
  const setInstall = (serial, outcome) => writeFileSync(path.join(state, `install-${serial}`), outcome);
  return { run, log, clearLog, rolledOut, setInstall, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

const installsOn = (log) => log.filter((l) => / install /.test(l)).map((l) => l.split(' ')[2]);

test('flags: --help exits 0, an unknown flag or a bad --only exits 2 before anything runs', () => {
  const m = machine();
  try {
    const help = m.run(['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--if-stale/);
    assert.doesNotMatch(help.stdout, /set -euo/);
    const bogus = m.run(['--bogus']);
    assert.equal(bogus.status, 2);
    assert.match(bogus.stderr, /unknown argument '--bogus'/);
    assert.equal(m.run(['--only', 'emulators']).status, 2);
    assert.equal(m.run(['--only']).status, 2);
    assert.deepEqual(m.log(), []);
  } finally {
    m.cleanup();
  }
});

test('installs on the phone and running Cultuvilla AVDs only; other repos and the E2E AVD are never touched', () => {
  const m = machine({
    phones: [PIXEL],
    running: { 'emulator-5554': 'ordago-dev', 'emulator-5610': 'Cultuvilla_Big', 'emulator-5612': 'Cultuvilla_E2E' },
    avds: ['Cultuvilla_Big', 'Cultuvilla_E2E', 'ordago-dev', 'ordago-slot-1'],
  });
  try {
    const result = m.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(installsOn(m.log()).sort(), [PIXEL, 'emulator-5610'].sort());
    const touched = m.log().filter((l) => /emulator-5554|emulator-5612/.test(l));
    assert.ok(touched.every((l) => / emu avd name /.test(l)), touched.join('\n'));
    assert.ok(!m.log().some((l) => /reverse|unexpected/.test(l)), m.log().join('\n'));
    assert.ok(m.log().filter((l) => l.startsWith('adb ')).every((l) => l.endsWith('serial_env=')), 'an inherited ANDROID_SERIAL is dropped');
    assert.equal(m.rolledOut(), 'fp-1');
  } finally {
    m.cleanup();
  }
});

test('a stopped Cultuvilla AVD is reported, not booted, and keeps the record unset', () => {
  const m = machine({ phones: [PIXEL], avds: ['Cultuvilla_Big', 'ordago-dev'] });
  try {
    const result = m.run();
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /Cultuvilla_Big is not running/);
    assert.doesNotMatch(result.stdout, /ordago-dev/);
    assert.equal(m.rolledOut(), null);
  } finally {
    m.cleanup();
  }
});

test('--only phones and --only avds pick their side', () => {
  const m = machine({ phones: [PIXEL], running: { 'emulator-5610': 'Cultuvilla_Big' } });
  try {
    assert.equal(m.run(['--only', 'phones']).status, 0);
    assert.deepEqual(installsOn(m.log()), [PIXEL]);
    m.clearLog();
    assert.equal(m.run(['--only', 'avds', '--skip-build']).status, 0);
    assert.deepEqual(installsOn(m.log()), ['emulator-5610']);
    assert.equal(m.rolledOut(), null, '--only never records a full rollout');
  } finally {
    m.cleanup();
  }
});

test('--dry-run lists the targets and builds or installs nothing', () => {
  const m = machine({ phones: [PIXEL], running: { 'emulator-5610': 'Cultuvilla_Big' } });
  try {
    const result = m.run(['--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /would build/);
    assert.match(result.stdout, new RegExp(`would install on phone ${PIXEL}`));
    assert.match(result.stdout, /would install on Cultuvilla_Big \(emulator-5610\)/);
    assert.ok(!m.log().includes('build'));
    assert.deepEqual(installsOn(m.log()), []);
  } finally {
    m.cleanup();
  }
});

test('a signature mismatch is reported unless --wipe-on-mismatch, which uninstalls first', () => {
  const m = machine({ phones: [PIXEL], installs: { [PIXEL]: 'mismatch' } });
  try {
    const first = m.run();
    assert.equal(first.status, 1);
    assert.match(first.stdout, /✗ Pixel 8 .*--wipe-on-mismatch/);
    assert.ok(!m.log().some((l) => / uninstall /.test(l)));
    assert.equal(m.rolledOut(), null);

    const second = m.run(['--wipe-on-mismatch']);
    assert.equal(second.status, 0, second.stdout);
    assert.ok(m.log().some((l) => l.includes(`-s ${PIXEL} uninstall com.cultuvilla.app.dev`)));
    assert.match(second.stdout, /✓ Pixel 8 .*sign in again/);
  } finally {
    m.cleanup();
  }
});

test('--if-stale does nothing once every device has this fingerprint, and rebuilds when it moves', () => {
  const m = machine({ phones: [PIXEL] });
  try {
    assert.equal(m.run().status, 0);
    m.clearLog();
    const same = m.run(['--if-stale']);
    assert.equal(same.status, 0);
    assert.match(same.stdout, /nothing to do/);
    assert.deepEqual(m.log(), []);

    const moved = m.run(['--if-stale'], 'fp-2');
    assert.equal(moved.status, 0);
    assert.ok(m.log().includes('build'));
    assert.equal(m.rolledOut(), 'fp-2');
  } finally {
    m.cleanup();
  }
});

test('a failed install records nothing, so --if-stale retries without rebuilding', () => {
  const m = machine({ phones: [PIXEL], installs: { [PIXEL]: 'fail' } });
  try {
    const first = m.run();
    assert.equal(first.status, 1);
    assert.match(first.stdout, /✗ Pixel 8 .*INSTALL_FAILED_INSUFFICIENT_STORAGE/);
    assert.equal(m.rolledOut(), null);

    m.setInstall(PIXEL, 'ok');
    m.clearLog();
    const retry = m.run(['--if-stale']);
    assert.equal(retry.status, 0, retry.stdout);
    assert.ok(!m.log().includes('build'), 'the APK at this fingerprint is reused');
    assert.deepEqual(installsOn(m.log()), [PIXEL]);
    assert.equal(m.rolledOut(), 'fp-1');
  } finally {
    m.cleanup();
  }
});

test('a rollout that fails half-way invalidates the previous record', () => {
  const m = machine({ phones: [PIXEL], running: { 'emulator-5610': 'Cultuvilla_Big' } });
  try {
    assert.equal(m.run([], 'fp-A').status, 0);
    assert.equal(m.rolledOut(), 'fp-A');
    m.setInstall('emulator-5610', 'fail');
    assert.equal(m.run([], 'fp-B').status, 1);
    assert.equal(m.rolledOut(), null);
    m.setInstall('emulator-5610', 'ok');
    m.clearLog();
    const back = m.run(['--if-stale'], 'fp-A');
    assert.equal(back.status, 0, back.stdout);
    assert.ok(m.log().includes('build'), 'the cached APK is B, so A is rebuilt');
    assert.equal(m.rolledOut(), 'fp-A');
  } finally {
    m.cleanup();
  }
});

test('an APK that embeds a JS bundle, or is no archive at all, is refused before any install', () => {
  const entries = ['assets/index.android.bundle', ...Array.from({ length: 5000 }, (_, i) => `res/raw/f${i}.bin`)];
  for (const apkEntries of [entries, null]) {
    const m = machine({ phones: [PIXEL], apkEntries });
    try {
      const result = m.run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, apkEntries ? /embeds a JS bundle/ : /cannot read .* as an APK/);
      assert.deepEqual(installsOn(m.log()), []);
    } finally {
      m.cleanup();
    }
  }
});

test('no phone attached is reported, not counted as a failure', () => {
  const m = machine();
  try {
    const result = m.run(['--only', 'phones']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /no phone attached/);
  } finally {
    m.cleanup();
  }
});

test('no early-exit reader sits at the end of a pipe (SIGPIPE under pipefail exits 141)', () => {
  // `printf … | grep -q` lets grep exit on its first match; the writer then dies
  // of SIGPIPE and pipefail turns a match into 141 — at random, by scheduling.
  // Read a captured string instead (`grep -q … <<< "$text"`).
  const offenders = readFileSync(SCRIPT, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !line.trimStart().startsWith('#'))
    .filter(({ line }) => /\|\s*(grep\s+(-\w*[qmlL]\w*)|head\b|sed\s+-n\s+'?\d+q|awk\s+[^|]*\bexit\b)/.test(line));
  assert.deepEqual(offenders, [], offenders.map(({ n, line }) => `${n}: ${line}`).join('\n'));
});
