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
 *   E2E_NATIVE_FLOW   Flows to run instead of the whole suite (same as
 *                     --flow): comma-separated numeric prefixes or names, e.g.
 *                     `20,22` or `20-register-to-event`. Runs quarantined
 *                     flows too; see selectFlows in scripts/lib/maestro-suite.mjs. Useful for
 *                     iterating on one flow under `pnpm test:e2e:android`,
 *                     which owns the emulator boot and takes no extra args.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SUITE_DIR, arg, run, runMaestroSuite } from './lib/maestro-suite.mjs';

const LABEL = 'android-e2e';
const ADB = process.env.ADB || 'adb';

const apk = arg('apk') ?? process.env.E2E_ANDROID_APK;
const flow = arg('flow') ?? process.env.E2E_NATIVE_FLOW;

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
  const code = run(LABEL, ADB, ['-s', device, 'install', '-r', '-d', apkPath]);
  if (code !== 0) process.exit(code);
}

// 3. Run the suite (scripts/lib/maestro-suite.mjs). Flows held OUT of the
//    gate on Android, with the reason each one is out — see that module for why
//    a quarantine is announced rather than silent.
// Shape: [['NN-name.yaml', 'reason, long enough to act on'], ...].
const QUARANTINED = new Map([]);

const DEVICE_WAIT_MS = 60_000;

// Airplane mode outlives a flow, and even a crashed Maestro process. A flow
// that left it on (45-offline-cached-village) would fail every flow after it
// for a reason none of them can see, so every flow starts online.
function startOnline() {
  run(LABEL, ADB, ['-s', device, 'shell', 'cmd', 'connectivity', 'airplane-mode', 'disable']);
  // Leaving airplane mode can drop the emulator's adb transport for a moment;
  // a flow started inside that window dies on "device offline" in seconds.
  // Bounded: a device that never comes back must fail the run by name, not
  // hang it until the CI job's timeout reports a bare "cancelled".
  const back = spawnSync(ADB, ['-s', device, 'wait-for-device'], { stdio: 'inherit', timeout: DEVICE_WAIT_MS });
  if (back.status !== 0) {
    console.error(`[${LABEL}] ${device} did not come back within ${DEVICE_WAIT_MS / 1000}s; stopping the run.`);
    process.exit(1);
  }
}

await runMaestroSuite({
  label: LABEL,
  device,
  quarantined: QUARANTINED,
  flow,
  reportDir: path.join(SUITE_DIR, 'report'),
  beforeEachFlow: startOnline,
});
