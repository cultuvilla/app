import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../avd-dev.sh', import.meta.url).pathname;
const IMAGE = 'system-images;android-36;google_apis;x86_64';

// A fake HOME with ~/Android/Sdk holding recording stubs, run on the Linux host.
// `adb` reports boot_completed only once the stub emulator has been launched.
function linuxBox({ imageInstalled = true, emulatorDies = false } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'avd-dev-'));
  const sdk = join(home, 'Android', 'Sdk');
  const log = join(home, 'calls');
  const stub = (rel, body) => {
    const file = join(sdk, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(file, 0o755);
  };
  if (imageInstalled) mkdirSync(join(sdk, 'system-images', 'android-36', 'google_apis', 'x86_64'), { recursive: true });
  stub('emulator/emulator', [
    'if [ "$1" = -list-avds ]; then exit 0; fi',
    `echo "emulator $* avd_home=$ANDROID_AVD_HOME" >> ${JSON.stringify(log)}`,
    emulatorDies ? 'exit 1' : `touch ${JSON.stringify(join(home, 'booted'))}; sleep 5`,
  ].join('\n'));
  stub('cmdline-tools/latest/bin/avdmanager', `cat >/dev/null; echo "avdmanager $* avd_home=$ANDROID_AVD_HOME" >> ${JSON.stringify(log)}; echo "Error: devices.xml missing" >&2`);
  stub('platform-tools/adb', [
    'case "$1" in',
    '  devices) echo "List of devices attached" ;;',
    `  shell) [ -f ${JSON.stringify(join(home, 'booted'))} ] && echo 1 ;;`,
    'esac',
  ].join('\n'));
  const run = (args, env = {}) => spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    env: { PATH: '/usr/bin:/bin', HOME: home, AVD_DEV_HOST: 'linux', XDG_CONFIG_HOME: join(home, '.config'), ...env },
  });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
  return { home, run, calls };
}

test('an unknown AVD_DEV_HOST is refused', () => {
  const r = spawnSync('bash', [SCRIPT, 'doctor'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', AVD_DEV_HOST: 'mac' } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /expected wsl or linux/);
});

test('on Linux, boot creates the missing AVD in ~/.android/avd and launches it', () => {
  const box = linuxBox();
  const r = box.run(['boot'], { AVD_BOOT_TIMEOUT: '20' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const avdHome = join(box.home, '.android', 'avd');
  const [create, launch] = box.calls();
  assert.equal(create, `avdmanager create avd --name Cultuvilla_Big --package ${IMAGE} --device pixel_7_pro avd_home=${avdHome}`);
  assert.equal(launch, `emulator @Cultuvilla_Big -no-snapshot-save avd_home=${avdHome}`);
  assert.doesNotMatch(r.stderr, /devices\.xml/, 'avdmanager\'s devices.xml noise is filtered');
});

test('the AVD home is pinned even when a desktop session sets XDG_CONFIG_HOME', () => {
  const box = linuxBox();
  box.run(['boot'], { AVD_BOOT_TIMEOUT: '20' });
  assert.ok(box.calls().every((line) => line.endsWith(`avd_home=${join(box.home, '.android', 'avd')}`)));
});

test('on Linux, an emulator that exits fails boot at once instead of waiting forever', () => {
  const box = linuxBox({ emulatorDies: true });
  const started = Date.now();
  const r = box.run(['boot'], { AVD_BOOT_TIMEOUT: '25' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /exited before booting/);
  assert.ok(Date.now() - started < 15000, 'failed well before the timeout');
});

test('on Linux, a missing system image names the sdkmanager command and creates nothing', () => {
  const box = linuxBox({ imageInstalled: false });
  const r = box.run(['boot'], { AVD_BOOT_TIMEOUT: '5' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`sdkmanager --install '${IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.deepEqual(box.calls(), []);
});
