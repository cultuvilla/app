#!/usr/bin/env node
/**
 * Build the standalone Android APK the native E2E suite runs against.
 *
 * WHY A SCRIPT AND NOT THREE LINES IN THE WORKFLOW: the build has three
 * non-obvious requirements that must hold together, and each one is a silent
 * failure if it drifts. Keeping them in one place means the local run and the
 * CI run are the same build.
 *
 *   1. `assembleRelease`, not `assembleDebug`. Only a release variant embeds the
 *      JS bundle; a debug APK expects a Metro server, which CI has none of.
 *      Expo's generated template signs `release` with the debug keystore, so no
 *      signing material is needed. `debugOptimized` looks like the right variant
 *      but is in React Native's `debuggableVariants` — also unbundled.
 *
 *   2. Cleartext HTTP to the emulator host. The app talks to
 *      `http://10.0.2.2:{8080,9099,5001,9199}`, and Android blocks cleartext in
 *      a release variant (the RN gradle plugin pins the manifest placeholder to
 *      "false"). We add a release-source-set manifest that re-enables it — the
 *      same trick Expo's own `src/debug/AndroidManifest.xml` uses. It is written
 *      into the GENERATED, gitignored `android/` tree, so it exists only for
 *      builds produced by this script; `eas build` runs its own prebuild and
 *      never sees it.
 *
 *   3. Gradle needs more metaspace than Expo's template grants it. The
 *      generated `gradle.properties` ships `-XX:MaxMetaspaceSize=512m`, and
 *      `:expo-updates:kspReleaseKotlin` exhausts it — KSP loads the whole
 *      annotation-processor classpath into metaspace, and `expo-updates` is the
 *      module that tips it over. The failure is doubly nasty: the OOM kills the
 *      Gradle daemon, which then spins emitting `OutOfMemoryError: Metaspace`
 *      from its RMI threads instead of exiting, so the job burns to its
 *      `timeout-minutes` and reports "cancelled" rather than the real error.
 *      We raise the ceiling AND build with `--no-daemon` so a fatal build dies
 *      immediately instead of hanging for another 45 minutes.
 *
 *   4. The E2E env must be set for BOTH prebuild and the gradle build.
 *      `USE_FIREBASE_EMULATOR` is read by app.config.ts (baked into
 *      `extra.useEmulator` by expo-constants at gradle time), while
 *      `EXPO_PUBLIC_EMULATOR_HOST` is inlined by Metro during the bundle task.
 *      Setting it for only one of the two produces an APK that looks right and
 *      silently talks to production Firebase.
 *
 *   5. The native SDKs take their project from google-services.json, not from
 *      FIREBASE_PROJECT_ID_DEV. The dev file names `villa-events`, while the
 *      emulators serve the seeded data and users under the test project — so an
 *      APK built from it reads an empty database and cannot sign anyone in. We
 *      write a copy re-pointed at the test project and hand app.config.ts its
 *      path; app.config.ts honours the override only in an emulator build.
 *
 * The armed bypass can only ever be a `dev` bundle: app.config.ts throws when
 * USE_FIREBASE_EMULATOR=1 meets APP_ENV=beta/prod.
 *
 * Usage: node scripts/build-android-e2e-apk.mjs [--skip-prebuild]
 * Prints the APK path on the last line.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = path.join(ROOT, 'apps', 'mobile');
const ANDROID = path.join(MOBILE, 'android');
const APK = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

// The AVD's alias for the host loopback interface. `127.0.0.1` inside an
// emulator is the device itself, so the app would find nothing there.
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '10.0.2.2';

const buildEnv = {
  ...process.env,
  APP_ENV: 'dev',
  USE_FIREBASE_EMULATOR: '1',
  EXPO_PUBLIC_EMULATOR_HOST: EMULATOR_HOST,
  // app.config.ts fails fast on a missing Firebase config. The emulator ignores
  // every value except the project id, which must match the seeder + emulator.
  FIREBASE_API_KEY_DEV: process.env.FIREBASE_API_KEY_DEV || 'e2e-placeholder',
  FIREBASE_AUTH_DOMAIN_DEV: process.env.FIREBASE_AUTH_DOMAIN_DEV || 'cultuvilla-test.firebaseapp.com',
  FIREBASE_PROJECT_ID_DEV: process.env.FIREBASE_PROJECT_ID_DEV || 'cultuvilla-test',
  FIREBASE_STORAGE_BUCKET_DEV: process.env.FIREBASE_STORAGE_BUCKET_DEV || 'cultuvilla-test.appspot.com',
  FIREBASE_MESSAGING_SENDER_ID_DEV: process.env.FIREBASE_MESSAGING_SENDER_ID_DEV || '0',
  FIREBASE_APP_ID_DEV: process.env.FIREBASE_APP_ID_DEV || 'e2e-placeholder',
  GOOGLE_IOS_CLIENT_ID_DEV: process.env.GOOGLE_IOS_CLIENT_ID_DEV || '',
  GOOGLE_IOS_URL_SCHEME_DEV: process.env.GOOGLE_IOS_URL_SCHEME_DEV || '',
};

// See requirement 5 above. Generated, gitignored, never committed.
const e2eGoogleServices = path.join(MOBILE, '.e2e', 'google-services.json');
{
  const projectId = buildEnv.FIREBASE_PROJECT_ID_DEV;
  const devConfig = JSON.parse(
    readFileSync(path.join(MOBILE, 'google-services', 'dev', 'google-services.json'), 'utf8'),
  );
  devConfig.project_info = {
    ...devConfig.project_info,
    project_id: projectId,
    storage_bucket: buildEnv.FIREBASE_STORAGE_BUCKET_DEV,
  };
  mkdirSync(path.dirname(e2eGoogleServices), { recursive: true });
  writeFileSync(e2eGoogleServices, JSON.stringify(devConfig, null, 2));
  buildEnv.E2E_GOOGLE_SERVICES_FILE = e2eGoogleServices;
  console.log(`[android-e2e-apk] native Firebase project: ${projectId}`);
}

function run(cmd, args, cwd) {
  console.log(`[android-e2e-apk] ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd, env: buildEnv, stdio: 'inherit' });
  if ((res.status ?? 1) !== 0) {
    console.error(`[android-e2e-apk] "${cmd} ${args.join(' ')}" failed`);
    process.exit(res.status ?? 1);
  }
}

if (!process.argv.includes('--skip-prebuild')) {
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean'], MOBILE);
}

// See requirement 3 above. `expo prebuild --clean` rewrites gradle.properties
// from the template every run, so this re-applies each time rather than being a
// one-off edit. Keyed on the exact property so a future template change that
// already raises the ceiling is left alone.
const gradleProps = path.join(ANDROID, 'gradle.properties');
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=2048m';
const props = readFileSync(gradleProps, 'utf8');
const patched = props.replace(/^org\.gradle\.jvmargs=.*$/m, `org.gradle.jvmargs=${JVM_ARGS}`);
if (patched === props) {
  console.error(`[android-e2e-apk] no org.gradle.jvmargs line in ${gradleProps} to patch`);
  process.exit(1);
}
writeFileSync(gradleProps, patched);
console.log(`[android-e2e-apk] gradle jvmargs: ${JVM_ARGS}`);

// See requirement 2 above. `tools:replace` is required because the merged
// manifest would otherwise conflict with the library manifests that declare it.
const releaseManifestDir = path.join(ANDROID, 'app', 'src', 'release');
mkdirSync(releaseManifestDir, { recursive: true });
writeFileSync(
  path.join(releaseManifestDir, 'AndroidManifest.xml'),
  `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <!-- Generated by scripts/build-android-e2e-apk.mjs. E2E ONLY: the suite's
         Firebase emulators are plain HTTP on the AVD host alias. Never committed
         and never present in an \`eas build\` prebuild. -->
    <application android:usesCleartextTraffic="true" tools:targetApi="28"
        tools:replace="android:usesCleartextTraffic" />
</manifest>
`,
);

// Only the ABI the AVD actually runs. The default builds all four, and the
// native compile of the RN/Expo modules for the three unused ones is the single
// largest chunk of wall-clock here — minutes, for an APK that is installed on
// exactly one x86_64 emulator and then thrown away.
const abi = process.env.E2E_ANDROID_ABI || 'x86_64';
run('./gradlew', ['assembleRelease', `-PreactNativeArchitectures=${abi}`, '--no-daemon'], ANDROID);

console.log(`[android-e2e-apk] emulator host baked in: ${EMULATOR_HOST}`);
console.log(APK);
