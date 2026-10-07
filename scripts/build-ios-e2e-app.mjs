#!/usr/bin/env node
/**
 * Build the iOS Simulator app the native E2E suite runs against. The iOS
 * counterpart of scripts/build-android-e2e-apk.mjs — macOS + Xcode only.
 *
 * WHY A SCRIPT AND NOT THREE LINES IN THE WORKFLOW: the local run and the CI run
 * must be the same build, and each requirement below is a silent failure if it
 * drifts.
 *
 *   1. `Release`, not `Debug`. Only Release embeds the JS bundle; a Debug build
 *      expects a Metro server, which CI has none of. A Simulator build needs no
 *      signing, so `CODE_SIGNING_ALLOWED=NO` removes the one thing a Release
 *      build would otherwise ask for.
 *
 *   2. Plain HTTP to the emulators on loopback. The Simulator shares the Mac's
 *      network, so — unlike the AVD — `127.0.0.1` IS the host and no alias is
 *      needed. App Transport Security still governs that HTTP, so
 *      `NSAllowsLocalNetworking` is set in the GENERATED, gitignored `ios/`
 *      tree's Info.plist. It exists only for builds produced by this script;
 *      `eas build` runs its own prebuild and never sees it.
 *
 *   3. The emulator-armed env and the re-pointed GoogleService-Info.plist are
 *      shared with the Android build — see scripts/lib/e2e-build-env.mjs for
 *      why each one must hold.
 *
 *   4. Keychain entitlements, embedded the way Xcode does it for a Simulator.
 *      Built with `CODE_SIGNING_ALLOWED=NO` the app carries no entitlements,
 *      and Firebase Auth persists the signed-in user in the keychain — which
 *      refuses a client without `application-identifier` (OSStatus -34018), so
 *      every sign-in failed silently and every logged-in flow failed with the
 *      app still a guest. Re-signing with them is no better: a Simulator app
 *      runs on the Mac's kernel, which refuses to spawn a binary whose
 *      SIGNATURE claims a restricted entitlement without a profile
 *      ("spawn failed, error=162: Codesigning issue"). Xcode's answer, copied
 *      here: link the entitlements into a `__TEXT,__entitlements` section,
 *      which the Simulator's own securityd reads, and leave the signature
 *      alone. The section is verified after the build.
 *
 *   5. One architecture: the runner's own. A generic Simulator destination
 *      otherwise compiles every pod for arm64 AND x86_64, for an app installed
 *      on exactly one Simulator and then thrown away.
 *
 * Usage: node scripts/build-ios-e2e-app.mjs [--skip-prebuild]
 * Prints the .app path on the last line.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { arch } from 'node:os';
import path from 'node:path';
import { MOBILE, e2eBuildEnv, writeE2ENativeFirebaseConfig } from './lib/e2e-build-env.mjs';

const LABEL = 'ios-e2e-app';
const IOS = path.join(MOBILE, 'ios');
const DERIVED_DATA = path.join(IOS, 'build');
// Generated, gitignored (apps/mobile/.gitignore), never committed.
const E2E_DIR = path.join(MOBILE, '.e2e');
const APPLE_TEAM_ID = '78RB67NT38';
const E2E_BUNDLE_ID = 'com.cultuvilla.app.dev';

if (process.platform !== 'darwin') {
  console.error(`[${LABEL}] the iOS Simulator build needs macOS + Xcode.`);
  process.exit(1);
}

const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';

const buildEnv = e2eBuildEnv(EMULATOR_HOST);
const projectId = writeE2ENativeFirebaseConfig(buildEnv, 'ios');
console.log(`[${LABEL}] native Firebase project: ${projectId}`);

function run(cmd, args, cwd) {
  console.log(`[${LABEL}] ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd, env: buildEnv, stdio: 'inherit' });
  if ((res.status ?? 1) !== 0) {
    console.error(`[${LABEL}] "${cmd} ${args.join(' ')}" failed`);
    process.exit(res.status ?? 1);
  }
}

if (!process.argv.includes('--skip-prebuild')) {
  // Runs `pod install` itself on macOS.
  run('npx', ['expo', 'prebuild', '--platform', 'ios', '--clean'], MOBILE);
}

// Prebuild names the project after the app's display name, which is per-env.
// Find it rather than hard-coding a name that a rename would silently break.
const workspace = readdirSync(IOS).find((f) => f.endsWith('.xcworkspace'));
if (!workspace) {
  console.error(`[${LABEL}] no .xcworkspace in ${IOS} — did prebuild run?`);
  process.exit(1);
}
const scheme = workspace.replace(/\.xcworkspace$/, '');

// See requirement 2 above.
const infoPlist = path.join(IOS, scheme, 'Info.plist');
if (!existsSync(infoPlist)) {
  console.error(`[${LABEL}] no Info.plist at ${infoPlist}`);
  process.exit(1);
}
const plistBuddy = (command) =>
  spawnSync('/usr/libexec/PlistBuddy', ['-c', command, infoPlist], { encoding: 'utf8' });
plistBuddy('Add :NSAppTransportSecurity dict');
if (plistBuddy('Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true').status !== 0) {
  run('/usr/libexec/PlistBuddy', ['-c', 'Set :NSAppTransportSecurity:NSAllowsLocalNetworking true', infoPlist]);
}

// See requirement 4 above. The E2E build is always the `dev` app, whose
// bundle id every flow already names (`appId:`). The team prefix is never
// checked on a Simulator; it is the app's real one (public — it is served in
// every AASA file).
const appIdentifier = `${APPLE_TEAM_ID}.${E2E_BUNDLE_ID}`;
const entitlements = path.join(E2E_DIR, 'Simulator.entitlements');
mkdirSync(E2E_DIR, { recursive: true });
writeFileSync(
  entitlements,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>application-identifier</key>
  <string>${appIdentifier}</string>
  <key>keychain-access-groups</key>
  <array>
    <string>${appIdentifier}</string>
  </array>
</dict>
</plist>
`,
);

// See requirement 5 above.
const simArch = process.env.E2E_IOS_ARCH || (arch() === 'arm64' ? 'arm64' : 'x86_64');
run(
  'xcodebuild',
  [
    '-workspace',
    workspace,
    '-scheme',
    scheme,
    '-configuration',
    'Release',
    '-sdk',
    'iphonesimulator',
    '-destination',
    'generic/platform=iOS Simulator',
    '-derivedDataPath',
    DERIVED_DATA,
    `ARCHS=${simArch}`,
    'ONLY_ACTIVE_ARCH=NO',
    'CODE_SIGNING_ALLOWED=NO',
    // `$(inherited)` keeps the CocoaPods linker flags this would otherwise
    // replace. Only the app links an executable: the pods are static.
    `OTHER_LDFLAGS=$(inherited) -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __entitlements -Xlinker ${entitlements}`,
    'build',
  ],
  IOS,
);

const products = path.join(DERIVED_DATA, 'Build', 'Products', 'Release-iphonesimulator');
const app = readdirSync(products).find((f) => f.endsWith('.app'));
if (!app) {
  console.error(`[${LABEL}] xcodebuild succeeded but produced no .app in ${products}`);
  process.exit(1);
}
const appPath = path.join(products, app);

// See requirement 4 above. Fail here, in seconds, rather than 20 minutes into
// a suite where every login silently fails.
const plistRead = spawnSync(
  '/usr/libexec/PlistBuddy',
  ['-c', 'Print :CFBundleExecutable', path.join(appPath, 'Info.plist')],
  { encoding: 'utf8' },
);
const executable = plistRead.stdout?.trim();
if (plistRead.status !== 0 || !executable) {
  console.error(`[${LABEL}] could not read CFBundleExecutable from ${appPath}: ${plistRead.stderr || plistRead.error}`);
  process.exit(1);
}
const otool = spawnSync('otool', ['-l', path.join(appPath, executable)], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (otool.status !== 0) {
  console.error(`[${LABEL}] otool could not read ${executable}: ${otool.stderr || otool.error}`);
  process.exit(1);
}
if (!/sectname __entitlements/.test(otool.stdout)) {
  console.error(`[${LABEL}] ${executable} has no __TEXT,__entitlements section — sign-in would fail`);
  process.exit(1);
}

console.log(`[${LABEL}] emulator host baked in: ${EMULATOR_HOST}`);
console.log(appPath);
