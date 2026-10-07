/**
 * The build environment shared by the native E2E builds
 * (scripts/build-android-e2e-apk.mjs, scripts/build-ios-e2e-app.mjs).
 *
 * Both platforms must produce the same thing — a `dev` bundle, armed for the
 * fixture login, talking to the local Firebase emulators under the test project
 * the seeder writes to. Only the host the device reaches those emulators at
 * differs, so it is the one parameter.
 *
 * The env must be used for BOTH prebuild and the native build.
 * `USE_FIREBASE_EMULATOR` is read by app.config.ts (baked into
 * `extra.useEmulator` by expo-constants during the native build), while
 * `EXPO_PUBLIC_EMULATOR_HOST` is inlined by Metro during the bundle step.
 * Setting it for only one of the two produces a build that looks right and
 * silently talks to production Firebase.
 *
 * The armed bypass can only ever be a `dev` bundle: app.config.ts throws when
 * USE_FIREBASE_EMULATOR=1 meets APP_ENV=beta/prod.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MOBILE = path.join(ROOT, 'apps', 'mobile');
const DEV_CONFIG_DIR = path.join(MOBILE, 'google-services', 'dev');
// Generated, gitignored (apps/mobile/.gitignore), never committed.
const E2E_CONFIG_DIR = path.join(MOBILE, '.e2e');

export function e2eBuildEnv(emulatorHost) {
  return {
    ...process.env,
    APP_ENV: 'dev',
    USE_FIREBASE_EMULATOR: '1',
    EXPO_PUBLIC_EMULATOR_HOST: emulatorHost,
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
}

/**
 * The native SDKs take their project from the committed native config file, not
 * from FIREBASE_PROJECT_ID_DEV. The dev files name `villa-events`, while the
 * emulators serve the seeded data and users under the test project — so a build
 * from them reads an empty database and cannot sign anyone in. Write copies
 * re-pointed at the test project and hand app.config.ts their paths;
 * app.config.ts honours the overrides only in an emulator build.
 *
 * Mutates `env` (adds E2E_GOOGLE_SERVICES_FILE / E2E_GOOGLE_SERVICE_INFO_FILE).
 */
export function writeE2ENativeFirebaseConfig(env, platform) {
  const projectId = env.FIREBASE_PROJECT_ID_DEV;
  const bucket = env.FIREBASE_STORAGE_BUCKET_DEV;
  mkdirSync(E2E_CONFIG_DIR, { recursive: true });

  if (platform === 'android') {
    const config = JSON.parse(readFileSync(path.join(DEV_CONFIG_DIR, 'google-services.json'), 'utf8'));
    config.project_info = { ...config.project_info, project_id: projectId, storage_bucket: bucket };
    const out = path.join(E2E_CONFIG_DIR, 'google-services.json');
    writeFileSync(out, JSON.stringify(config, null, 2));
    env.E2E_GOOGLE_SERVICES_FILE = out;
  } else if (platform === 'ios') {
    const plist = readFileSync(path.join(DEV_CONFIG_DIR, 'GoogleService-Info.plist'), 'utf8');
    const out = path.join(E2E_CONFIG_DIR, 'GoogleService-Info.plist');
    writeFileSync(out, setPlistString(setPlistString(plist, 'PROJECT_ID', projectId), 'STORAGE_BUCKET', bucket));
    env.E2E_GOOGLE_SERVICE_INFO_FILE = out;
  } else {
    throw new Error(`unknown platform: ${platform}`);
  }
  return projectId;
}

/** Replace a top-level `<key>KEY</key><string>…</string>` value; throws if absent. */
export function setPlistString(plist, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (!pattern.test(plist)) throw new Error(`GoogleService-Info.plist has no ${key} to re-point`);
  return plist.replace(pattern, `$1${value}$2`);
}
