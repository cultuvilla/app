#!/usr/bin/env node
/**
 * Run the native (Maestro) E2E suite against an iOS Simulator. The iOS
 * counterpart of scripts/run-android-e2e.mjs — the SAME flows, run by the same
 * loop (scripts/lib/maestro-suite.mjs). macOS + Xcode only.
 *
 * It is deliberately NOT responsible for the Firebase emulators —
 * `pnpm test:e2e:ios` wraps it in scripts/run-tests-with-emulators.mjs, which
 * owns the emulator boot and the seeding step.
 *
 * What it does own:
 *   1. a booted Simulator — the one already booted, or else it boots the newest
 *      iPhone available, so CI needs no device name that rots with each Xcode,
 *   2. installing the .app under test when one is named,
 *   3. accepting iOS's one-time "Open in …?" deep-link prompt
 *      (apps/mobile/e2e/native/ios/trust-deep-links.yaml),
 *   4. running the suite with a JUnit report so CI can render failures.
 *
 * Usage:
 *   node scripts/run-ios-e2e.mjs [--app <path>] [--flow <name>]
 *   node scripts/run-ios-e2e.mjs --boot-only
 *
 * `--boot-only` boots the Simulator the run will pick, waits until it has
 * finished, and returns. CI runs it as its own step between the app build and
 * the suite: a cold boot pins the runner's three cores for minutes
 * (LaunchServices migration, system apps). Overlapping it with the suite's
 * start made Maestro's XCTest driver time out; overlapping it with the build
 * halved the build's speed. Run alone, it costs only its own few minutes.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MAESTRO, MAESTRO_ENV, ROOT, SUITE_DIR, arg, planFlows, run, runMaestroSuite } from './lib/maestro-suite.mjs';

const LABEL = 'ios-e2e';

if (process.platform !== 'darwin') {
  console.error(`[${LABEL}] the iOS Simulator needs macOS + Xcode.`);
  process.exit(1);
}

const app = arg('app') ?? process.env.E2E_IOS_APP;
const bootOnly = process.argv.includes('--boot-only');

// A first `maestro test` on a fresh Simulator builds and installs the XCTest
// driver, which takes far longer than on an AVD: the shared 180s default
// expired on CI. Longer here unless the caller has already said otherwise.
const IOS_MAESTRO_ENV = {
  ...MAESTRO_ENV,
  MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT || '600000',
};
const flow = arg('flow') ?? process.env.E2E_NATIVE_FLOW;

function simctlDevices(...filter) {
  const res = spawnSync('xcrun', ['simctl', 'list', 'devices', ...filter, '--json'], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`[${LABEL}] \`xcrun simctl list devices\` failed — is Xcode installed and selected?`);
    console.error(res.stderr);
    process.exit(1);
  }
  // { devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [ {udid, name, state, …} ] } }
  return Object.entries(JSON.parse(res.stdout).devices).flatMap(([runtime, list]) =>
    list.map((d) => ({ ...d, runtime })),
  );
}

// The runtime id ends in the iOS version (`…iOS-26-0`); compare it numerically
// so iOS 26 outranks iOS 9.
const runtimeVersion = (runtime) =>
  (/iOS-([\d-]+)$/.exec(runtime)?.[1] ?? '0').split('-').map(Number);
const newerFirst = (a, b) => {
  const [va, vb] = [runtimeVersion(a.runtime), runtimeVersion(b.runtime)];
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    if ((vb[i] ?? 0) !== (va[i] ?? 0)) return (vb[i] ?? 0) - (va[i] ?? 0);
  }
  return 0;
};

// Flows held OUT of the gate on iOS, with the reason each one is out — see
//    scripts/lib/maestro-suite.mjs for why a quarantine is announced rather
//    than silent. Separate from Android's: a flow can fail on one platform's
//    transport and pass on the other's.
const QUARANTINED = new Map([
  [
    '50-onboarding-complete-profile.yaml',
    'its keyboard choreography is tuned to the Android AVD (swipe endpoints as ' +
      'percentages of a pixel_5, no hideKeyboard). On the iOS Simulator the step-1 ' +
      '"Siguiente" tap left the form on step 1 with the keyboard up, so birthday-year ' +
      '(step 2) never appeared (first full iOS run, 2026-10-06). Android still runs ' +
      'it. Chase with `pnpm e2e:ci:ios -f flows=50`.',
  ],
  [
    '45-offline-cached-village.yaml',
    "drives the device offline with Maestro's setAirplaneMode, which is " +
      'Android-only: a Simulator shares the Mac\'s network and has no airplane ' +
      'mode to toggle. Offline rendering on iOS needs a different lever (e.g. ' +
      'stopping the emulators mid-flow) before this can run here.',
  ],
]);

// A shard (or a dispatched selection) can leave this machine nothing to run;
// then there is no point booting, installing and trusting deep links for it.
if (!bootOnly && planFlows({ label: LABEL, quarantined: QUARANTINED, flow }).flows.length === 0) {
  console.log(`[${LABEL}] nothing to run on this machine`);
  process.exit(0);
}

// 1. A booted Simulator, before anything else — a missing one otherwise
//    surfaces as an opaque Maestro timeout minutes later.
let device = process.env.E2E_IOS_DEVICE;
if (!device) {
  const booted = simctlDevices('booted').filter((d) => d.runtime.includes('iOS'));
  device = booted[0]?.udid;
}
if (!device) {
  const iphone = simctlDevices('available')
    .filter((d) => d.runtime.includes('iOS') && d.name.startsWith('iPhone'))
    .sort(newerFirst)[0];
  if (!iphone) {
    console.error(`[${LABEL}] no iPhone Simulator available. Install an iOS runtime in Xcode.`);
    process.exit(1);
  }
  console.log(`[${LABEL}] booting ${iphone.name} (${iphone.runtime})`);
  device = iphone.udid;
}
// Idempotent on an already-booted device: `-b` boots it if needed and waits
// until it has finished booting either way.
if (run(LABEL, 'xcrun', ['simctl', 'bootstatus', device, '-b']) !== 0) process.exit(1);
if (bootOnly) process.exit(0);
console.log(`[${LABEL}] device: ${device}`);

// 2. Install the build under test. Re-installing over an existing install
//    replaces it in place.
if (app) {
  const appPath = path.resolve(ROOT, app);
  if (!existsSync(appPath)) {
    console.error(`[${LABEL}] .app not found: ${appPath}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] installing ${appPath}`);
  const code = run(LABEL, 'xcrun', ['simctl', 'install', device, appPath]);
  if (code !== 0) process.exit(code);
}

// 3. See the flow's header. Fatal: if the prompt cannot be answered, every
//    flow would fail on its first link, naming the wrong cause each time.
//    Tried twice: it is also the step that starts Maestro's driver, and a
//    driver that lost a startup race on a loaded runner is not a broken app.
//    The flow is idempotent (the prompt is optional), so a retry is safe.
let trusted = 1;
for (let attempt = 1; attempt <= 2 && trusted !== 0; attempt++) {
  console.log(`\n[${LABEL}] ─── trusting the app's deep links (attempt ${attempt}) ───`);
  trusted = run(
    LABEL,
    MAESTRO,
    ['--device', device, 'test', path.join(SUITE_DIR, 'ios', 'trust-deep-links.yaml')],
    { env: IOS_MAESTRO_ENV },
  );
}
if (trusted !== 0) {
  console.error(`[${LABEL}] could not open the app from a deep link; not running the suite.`);
  process.exit(1);
}


// Maestro's `clearState` on iOS wipes the app's container but NOT the keychain,
// where Firebase Auth keeps the signed-in user — so each flow inherited the last
// one's session. After flow 50 left a half-onboarded user signed in, every later
// flow opened on "Completa tu perfil" and never saw a tab bar. Android's
// `clearState` already signs out; this makes iOS start every flow the same way.
function resetKeychain() {
  if (run(LABEL, 'xcrun', ['simctl', 'keychain', device, 'reset']) !== 0) {
    console.error(`[${LABEL}] could not reset the Simulator keychain`);
    process.exit(1);
  }
}

await runMaestroSuite({
  label: LABEL,
  device,
  quarantined: QUARANTINED,
  flow,
  reportDir: path.join(SUITE_DIR, 'report'),
  env: IOS_MAESTRO_ENV,
  beforeEachFlow: resetKeychain,
});
