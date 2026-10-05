#!/usr/bin/env node
/**
 * Run the native (Maestro) Android E2E suite against a booted AVD.
 *
 * It is deliberately NOT responsible for the Firebase emulators —
 * `pnpm test:e2e:android` wraps it in scripts/run-tests-with-emulators.mjs,
 * which owns the emulator boot and the seeding step.
 *
 * What it does own:
 *   1. proving a device is actually attached (a missing AVD otherwise surfaces
 *      as an opaque Maestro timeout minutes later),
 *   2. installing the APK under test when one is named,
 *   3. running the suite with a JUnit report so CI can render failures.
 *
 * Usage:
 *   node scripts/run-android-e2e.mjs [--apk <path>] [--flow <name>]
 *
 * Env:
 *   E2E_ANDROID_APK   APK to install first (same as --apk). Omit to test
 *                     whatever build is already on the device.
 *   ADB               adb binary (default `adb`). Under WSL2 the emulator runs
 *                     on the Windows host, so this must be the Windows
 *                     adb.exe — see the drive-android-avd skill.
 *   MAESTRO_BIN       maestro binary (default `maestro`).
 *   E2E_ANDROID_DEVICE  adb id to target; defaults to the first attached
 *                     emulator (see the selection note below).
 *   E2E_NATIVE_FLOW   Single flow file to run (same as --flow). Useful for
 *                     iterating on one flow under `pnpm test:e2e:android`,
 *                     which owns the emulator boot and takes no extra args.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUITE_DIR = path.join(ROOT, 'apps', 'mobile', 'e2e', 'native');
const FLOWS_DIR = path.join(SUITE_DIR, 'flows');
const REPORT_DIR = path.join(SUITE_DIR, 'report');

const ADB = process.env.ADB || 'adb';
const MAESTRO = process.env.MAESTRO_BIN || 'maestro';

// Maestro installs a driver APK on the device and connects to it over a
// forwarded port. Its default startup budget is tight enough that a cold or
// loaded emulator — a CI runner's software-rendered AVD, or a Windows-hosted
// one reached across a WSL2 adb bridge — loses the race and dies with an opaque
// `AndroidDriverTimeoutException` that reads like a broken flow. Give it room
// unless the caller has already said otherwise.
const MAESTRO_ENV = {
  ...process.env,
  MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT || '180000',
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const apk = arg('apk') ?? process.env.E2E_ANDROID_APK;
const flow = arg('flow') ?? process.env.E2E_NATIVE_FLOW;

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (res.error) {
    console.error(`[android-e2e] failed to spawn ${cmd}: ${res.error.message}`);
    process.exit(1);
  }
  return res.status ?? 1;
}

// 1. A device must be attached BEFORE anything else — the failure mode we are
//    avoiding is a five-minute Maestro hang that says nothing about the cause.
const devices = spawnSync(ADB, ['devices'], { encoding: 'utf8' });
if (devices.status !== 0) {
  console.error(
    `[android-e2e] \`${ADB} devices\` failed. Set ADB to a working adb binary ` +
      '(under WSL2 that is the Windows-side adb.exe — see the drive-android-avd skill).',
  );
  process.exit(1);
}
const attached = devices.stdout
  .split('\n')
  .slice(1)
  .filter((l) => /\tdevice$/.test(l.trim()))
  .map((l) => l.trim().split('\t')[0]);
if (attached.length === 0) {
  console.error('[android-e2e] no Android device/emulator attached. Boot an AVD first.');
  console.error(devices.stdout.trim());
  process.exit(1);
}
// Pin the target explicitly and pass it to BOTH adb and Maestro. With more than
// one device attached — a developer's phone plugged in next to the AVD — adb
// refuses outright and Maestro picks one on its own, so the install and the run
// can disagree about what is being tested. Prefer an emulator: this suite
// installs a debug-signed APK wired to a local Firebase emulator, which has no
// business landing on a real phone.
const device =
  process.env.E2E_ANDROID_DEVICE ??
  attached.find((id) => id.startsWith('emulator-')) ??
  attached[0];
console.log(`[android-e2e] device: ${device}${attached.length > 1 ? ` (of ${attached.length} attached)` : ''}`);

// 2. Install the build under test. `-r` so a re-run over an existing install
//    updates in place; `-d` allows a downgrade when re-testing an older commit.
if (apk) {
  const apkPath = path.resolve(ROOT, apk);
  if (!existsSync(apkPath)) {
    console.error(`[android-e2e] APK not found: ${apkPath}`);
    process.exit(1);
  }
  console.log(`[android-e2e] installing ${apkPath}`);
  const code = run(ADB, ['-s', device, 'install', '-r', '-d', apkPath]);
  if (code !== 0) process.exit(code);
}

// 3. Run the flows IN FILENAME ORDER, one `maestro test` per flow.
//
//    Maestro's workspace mode does not guarantee the order it discovers flows
//    in, and this suite depends on it: 22 unregisters what 20 registered. A
//    reshuffle would turn a healthy suite red for reasons that have nothing to
//    do with the app. Driving the order here also gives one JUnit report per
//    flow, so a CI failure names the flow instead of the workspace.
//
//    A failing flow does NOT stop the run: the rest of the suite is still worth
//    knowing about, and a cascade (22 failing because 20 did) is itself the
//    diagnosis.
// Flows held OUT of the gate, with the reason each one is out. A quarantine is
// a coverage cut, so it is announced on every run and named in the summary: a
// suite that silently shrank reads as "everything passed", which is worse than
// a red lane. `--flow` still runs a quarantined flow explicitly, so chasing one
// needs no edit here.
const QUARANTINED = new Map([
  [
    '50-onboarding-complete-profile.yaml',
    "profile submit hung on the Firestore JS SDK's cleartext connection to " +
      '10.0.2.2 (logcat: "unexpected end of stream on http://10.0.2.2:8080"). A ' +
      'Firestore write promise never settles when the connection drops, so the ' +
      'button spins forever. Onboarding has no other E2E coverage while this is ' +
      'held out. Re-run it with --flow on @react-native-firebase before anything else.',
  ],
]);

mkdirSync(REPORT_DIR, { recursive: true });
const discovered = readdirSync(FLOWS_DIR)
  .filter((f) => f.endsWith('.yaml'))
  .sort();

// An entry that no longer matches a file is a stale quarantine — fail rather
// than let it rot into a line nobody can act on.
for (const name of QUARANTINED.keys()) {
  if (!discovered.includes(name)) {
    console.error(`[android-e2e] quarantine names a flow that does not exist: ${name}`);
    process.exit(1);
  }
}

const skipped = flow ? [] : discovered.filter((f) => QUARANTINED.has(f));
const flows = flow ? [flow] : discovered.filter((f) => !QUARANTINED.has(f));

for (const name of skipped) {
  console.warn(`\n[android-e2e] !! QUARANTINED, NOT RUN: ${name}`);
  console.warn(`[android-e2e]    ${QUARANTINED.get(name)}`);
}

const failed = [];
for (const name of flows) {
  console.log(`\n[android-e2e] ─── ${name} ───`);
  const status = run(
    MAESTRO,
    [
      '--device',
      device,
      'test',
      path.join(FLOWS_DIR, name),
      '--format',
      'junit',
      '--output',
      path.join(REPORT_DIR, `${name.replace(/\.yaml$/, '')}.xml`),
    ],
    { env: MAESTRO_ENV },
  );
  if (status !== 0) failed.push(name);
}

const quarantineNote = skipped.length
  ? ` (${skipped.length} quarantined and NOT run: ${skipped.join(', ')})`
  : '';

if (failed.length > 0) {
  console.error(`\n[android-e2e] ${failed.length}/${flows.length} flow(s) failed:`);
  for (const name of failed) console.error(`  - ${name}`);
  if (quarantineNote) console.error(`[android-e2e]${quarantineNote}`);
  process.exit(1);
}
console.log(`\n[android-e2e] all ${flows.length} flow(s) passed${quarantineNote}`);
