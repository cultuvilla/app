import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExpoConfig } from 'expo/config';
import type { FirebaseOptions } from 'firebase/app';

type Env = 'dev' | 'beta' | 'prod';

function resolveEnv(): Env {
  const raw = process.env.APP_ENV;
  if (raw === 'dev' || raw === 'beta' || raw === 'prod') return raw;
  return 'dev';
}

const env = resolveEnv();

// Build-time hard guard on the E2E auth bypass.
//
// `USE_FIREBASE_EMULATOR=1` arms BOTH the emulator-connect seam and the
// fixture-login (see `extra.useEmulator` below). It used to be structurally
// impossible for that to reach a store binary because the seam was web-only;
// now that the native (Maestro) driver needs it too, "web-only" is no longer
// the wall. So the wall moves here: a beta/prod build with the flag set is a
// build failure, on EVERY path — CI, EAS, and a laptop alike — because
// app.config.ts is evaluated by all of them. The deploy workflows' runtime
// assertion stays as a second, independent layer.
if (process.env['USE_FIREBASE_EMULATOR'] === '1' && env !== 'dev') {
  throw new Error(
    `[cultuvilla] USE_FIREBASE_EMULATOR=1 with APP_ENV=${env}. The E2E auth ` +
      'bypass may only be built into a `dev` bundle pointed at local emulators. ' +
      'Refusing to build.',
  );
}

// Home-screen labels. Non-prod builds are one short word, as in Órdago: launchers
// truncate "Cultuvilla Beta" to "Cultuvilla B…", and next to the store app's
// "Cultuvilla" a bare "Beta" / "Dev" is the clearer tell. The Play listing is
// still named "Cultuvilla Beta"; only the icon label is short.
const namePerEnv: Record<Env, string> = {
  dev: 'Dev',
  beta: 'Beta',
  prod: 'Cultuvilla',
};

// Application identity per env. Read this together with
// docs/decisions/beta-is-its-own-play-app.md.
//
// A separate package is a separate INSTALL — which is the point: the `.beta`
// Play app and the `.dev` sideload sit next to the store app instead of
// replacing it. Each one therefore needs its own FCM config
// (google-services/<env>), its own Google Sign-In Android OAuth client (package
// + signing SHA-1) and its own App Links host, never the prod one.
const bundleIdPerEnv: Record<Env, string> = {
  dev: 'com.cultuvilla.app.dev',
  beta: 'com.cultuvilla.app.beta',
  prod: 'com.cultuvilla.app',
};

// Each env's deep-link host MUST be a Firebase Hosting domain of that env's
// project (where the readSite rewrites live). dev = villa-events project,
// beta = cultuvilla-beta, prod = cultuvilla-prod. Prod uses the brand custom
// domain cultuvilla.es (attached to the cultuvilla-prod site) so shared links
// carry the brand, not the *.web.app default. The old villa-events-*.web.app
// sites never existed post-rename, so share links 404'd.
const deepLinkHostPerEnv: Record<Env, string> = {
  dev: process.env['DEEP_LINK_HOST_DEV'] ?? 'villa-events.web.app',
  beta: process.env['DEEP_LINK_HOST_BETA'] ?? 'cultuvilla-beta.web.app',
  prod: process.env['DEEP_LINK_HOST_PROD'] ?? 'cultuvilla.es',
};

// Firebase config is injected per-environment from .env (or EAS secrets).
// DO NOT commit real keys — use a local .env file (gitignored) with these vars:
//   FIREBASE_API_KEY_DEV, FIREBASE_AUTH_DOMAIN_DEV, FIREBASE_PROJECT_ID_DEV,
//   FIREBASE_STORAGE_BUCKET_DEV, FIREBASE_MESSAGING_SENDER_ID_DEV, FIREBASE_APP_ID_DEV,
//   (same suffixes for _BETA and _PROD)
// Google Sign-In OAuth client IDs (one set per env). Get them from the
// Google Cloud Console for the matching Firebase project:
//   APIs & Services → Credentials → OAuth 2.0 Client IDs
// You need three per env: Web (used by Firebase to verify the idToken),
// iOS (must match the iOS bundle id), and Android (must match the package
// name + the SHA-1 of the signing key that built the app).
// The iOS URL scheme is the reversed iOS client id, prefixed with
// `com.googleusercontent.apps.` — copy the "iOS URL scheme" value shown
// by the GCP console.
interface GoogleSignInConfig {
  webClientId: string;
  iosClientId: string;
  iosUrlScheme: string;
}

const googleSignInPerEnv: Record<Env, GoogleSignInConfig> = {
  dev: {
    webClientId: process.env['GOOGLE_WEB_CLIENT_ID_DEV'] ?? '',
    iosClientId: process.env['GOOGLE_IOS_CLIENT_ID_DEV'] ?? '',
    iosUrlScheme: process.env['GOOGLE_IOS_URL_SCHEME_DEV'] ?? '',
  },
  beta: {
    webClientId: process.env['GOOGLE_WEB_CLIENT_ID_BETA'] ?? '',
    iosClientId: process.env['GOOGLE_IOS_CLIENT_ID_BETA'] ?? '',
    iosUrlScheme: process.env['GOOGLE_IOS_URL_SCHEME_BETA'] ?? '',
  },
  prod: {
    webClientId: process.env['GOOGLE_WEB_CLIENT_ID_PROD'] ?? '',
    iosClientId: process.env['GOOGLE_IOS_CLIENT_ID_PROD'] ?? '',
    iosUrlScheme: process.env['GOOGLE_IOS_URL_SCHEME_PROD'] ?? '',
  },
};

// Android push needs the NATIVE Firebase config: expo-notifications mints an FCM
// token from it, and without the file Android push silently never registers.
// (iOS needs no counterpart — its tokens are raw APNs and go to APNs directly;
// see docs/plans/ongoing/device-notifications.md.) Committed per env under
// google-services/ like the .well-known signing identities: it carries no
// secret, and a value in git is reviewable and identical for a local prebuild.
// Only wired when present, so a checkout without it still builds — minus push.
// The native E2E build points the native SDKs at the emulators' test project
// (scripts/build-android-e2e-apk.mjs); honoured only in that emulator build.
const googleServicesFile =
  process.env['USE_FIREBASE_EMULATOR'] === '1' && process.env['E2E_GOOGLE_SERVICES_FILE']
    ? process.env['E2E_GOOGLE_SERVICES_FILE']
    : `./google-services/${env}/google-services.json`;
// Resolved against this file, not the cwd: tests and CI evaluate the config
// from the repo root as well as from apps/mobile.
const hasGoogleServicesFile = existsSync(resolve(__dirname, googleServicesFile));

// iOS native Firebase config, read by @react-native-firebase/app (analytics).
// Its config plugin throws at prebuild without the file, so the plugin is only
// wired when this env has one — a build without it still runs, with native
// analytics as a no-op. Android needs nothing extra: it initialises from the
// google-services.json above. Same committed-per-env rule (no secret inside).
const iosGoogleServicesFile = `./google-services/${env}/GoogleService-Info.plist`;
const hasIosGoogleServicesFile = existsSync(resolve(__dirname, iosGoogleServicesFile));

const firebaseConfigPerEnv: Record<Env, FirebaseOptions> = {
  dev: {
    apiKey: process.env['FIREBASE_API_KEY_DEV'] ?? '',
    authDomain: process.env['FIREBASE_AUTH_DOMAIN_DEV'] ?? '',
    projectId: process.env['FIREBASE_PROJECT_ID_DEV'] ?? '',
    storageBucket: process.env['FIREBASE_STORAGE_BUCKET_DEV'] ?? '',
    messagingSenderId: process.env['FIREBASE_MESSAGING_SENDER_ID_DEV'] ?? '',
    appId: process.env['FIREBASE_APP_ID_DEV'] ?? '',
  },
  beta: {
    apiKey: process.env['FIREBASE_API_KEY_BETA'] ?? '',
    authDomain: process.env['FIREBASE_AUTH_DOMAIN_BETA'] ?? '',
    projectId: process.env['FIREBASE_PROJECT_ID_BETA'] ?? '',
    storageBucket: process.env['FIREBASE_STORAGE_BUCKET_BETA'] ?? '',
    messagingSenderId: process.env['FIREBASE_MESSAGING_SENDER_ID_BETA'] ?? '',
    appId: process.env['FIREBASE_APP_ID_BETA'] ?? '',
  },
  prod: {
    apiKey: process.env['FIREBASE_API_KEY_PROD'] ?? '',
    authDomain: process.env['FIREBASE_AUTH_DOMAIN_PROD'] ?? '',
    projectId: process.env['FIREBASE_PROJECT_ID_PROD'] ?? '',
    storageBucket: process.env['FIREBASE_STORAGE_BUCKET_PROD'] ?? '',
    messagingSenderId: process.env['FIREBASE_MESSAGING_SENDER_ID_PROD'] ?? '',
    appId: process.env['FIREBASE_APP_ID_PROD'] ?? '',
  },
};

const config: ExpoConfig = {
  name: namePerEnv[env],
  slug: 'cultuvilla',
  // Pinned, not env-derived: an env var is machine-global, and the dev machines
  // also check out ordago-apps (owner `ordago-apps`). A stray EAS_PROJECT_ID in
  // the shell would silently build one repo into the other's EAS project; owner
  // + projectId in the file make the routing per-repo by construction.
  owner: 'cultuvilla.app',
  version: '1.7.0',
  orientation: 'portrait',
  icon: './assets/icon.png',

  // OTA updates. A merge to `beta` publishes the JS bundle to the `beta`
  // channel (.github/workflows/mobile-ota.yml); the profiles in eas.json already
  // map each build to its channel.
  updates: {
    url: 'https://u.expo.dev/53188e5f-c5a1-4b1c-a009-44108826d54d',
    // Check on launch but never block it: a slow network must not hold the
    // splash screen. A published update lands on the NEXT launch.
    fallbackToCacheTimeout: 0,
  },
  // `fingerprint`, NOT `appVersion` — this is load-bearing. `appVersion` ties an
  // update to the marketing version, and we bump the MINOR on every single
  // develop -> beta promotion, so every bump would strand OTA against the
  // binaries already installed: the fix that motivated this would still not
  // reach anyone. A fingerprint is derived from the native dependency graph, so
  // a JS-only change keeps the same runtime version and flows over the air,
  // while adding a native module changes it and correctly refuses to target
  // binaries that cannot run the new code.
  runtimeVersion: {
    policy: 'fingerprint',
  },
  scheme: 'cultuvilla',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: bundleIdPerEnv[env],
    ...(hasIosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    supportsTablet: true,
    associatedDomains: [`applinks:${deepLinkHostPerEnv[env]}`],
    infoPlist: {
      // Only standard HTTPS/TLS — declaring the exemption here stops App Store
      // Connect asking for an export-compliance answer on every single build.
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'Cultuvilla usa tu ubicación para fijar la del pueblo en el mapa.',
      // expo-image-picker reads the photo library to pick + crop avatars/escudos;
      // iOS requires this usage string.
      NSPhotoLibraryUsageDescription:
        'Cultuvilla necesita acceso a tus fotos para elegir y recortar tu imagen de perfil.',
    },
    // No `com.apple.developer.usernotifications.time-sensitive` entitlement yet:
    // the App ID lacks the capability, and the App Store Connect API cannot add
    // it (Apple's public capabilityType enum has no value for it) — only the
    // Account Holder can, in the developer portal. Declaring it without the
    // capability fails every iOS archive. Without it iOS silently downgrades our
    // `time-sensitive` pushes to `active`. Restore it once the box is ticked.
  },
  android: {
    package: bundleIdPerEnv[env],
    ...(hasGoogleServicesFile ? { googleServicesFile } : {}),
    // Every permission in the manifest has to be justified in the Play Console
    // Data Safety form, and background location additionally needs a written
    // declaration plus a video review. expo-location and expo-image-picker each
    // pull in more than we use, so strip what no screen actually calls: the app
    // only reads a coarse/fine location once (to drop the village pin) and picks
    // an existing image from the library — it never records, never uses the
    // camera, and never tracks location in the background.
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        // The whole host: URLs start with the pueblo's slug (`/matabuena/…`), so
        // there is no fixed prefix to claim. Android cannot exclude paths; iOS
        // excludes `/entrar` in the AASA so a sign-in link stays in the browser.
        data: [{ scheme: 'https', host: deepLinkHostPerEnv[env] }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  extra: {
    APP_ENV: env,
    firebaseConfig: firebaseConfigPerEnv[env],
    googleSignIn: googleSignInPerEnv[env],
    deepLinkHost: deepLinkHostPerEnv[env],
    // E2E only: when USE_FIREBASE_EMULATOR=1 (set ONLY by the web-e2e CI job,
    // never by any deploy workflow — deploy-*.yml positively assert it is unset),
    // firebaseInit wires the client SDK to the local emulators AND AuthContext
    // enables the fixture-login. One flag gates both halves, so a fixture session
    // can only be minted when the app points at 127.0.0.1 emulators. A deployed
    // build talks to real Firebase with no emulator reachable, so the bypass
    // fails closed even if this flag somehow leaked. The check:no-test-login-leak
    // grep gate blocks the flag/seam symbols from escaping their allowlisted files.
    useEmulator: process.env['USE_FIREBASE_EMULATOR'] === '1',
    // Dev-only login buttons: when DEV_LOGIN_EMAILS (comma-separated) and
    // DEV_LOGIN_PASSWORD are set in a `dev` build, the login screen offers a
    // one-tap sign-in to each account. Gated to env === 'dev' here AND behind
    // __DEV__ in AuthContext, so the creds never reach a beta/prod bundle.
    devLogin:
      env === 'dev' && process.env['DEV_LOGIN_EMAILS'] && process.env['DEV_LOGIN_PASSWORD']
        ? {
            emails: process.env['DEV_LOGIN_EMAILS']
              .split(',')
              .map((e: string) => e.trim())
              .filter(Boolean),
            password: process.env['DEV_LOGIN_PASSWORD'],
          }
        : null,
    eas: {
      projectId: '53188e5f-c5a1-4b1c-a009-44108826d54d',
    },
  },
  plugins: [
    // `disableSPM`: RNFirebase resolves the Firebase iOS SDK through Swift
    // Package Manager by default, and SPM + the static linkage below aborts
    // `pod install` ("SPM + static linkage is not supported" — each pod would
    // embed its own Firebase copy). CocoaPods keeps a single copy.
    ...(hasIosGoogleServicesFile
      ? [['@react-native-firebase/app', { ios: { disableSPM: true } }] as [string, object]]
      : []),
    // RNFirebase's pods are Swift and need static framework linkage. Always on,
    // not gated with the plist: the pods are autolinked either way.
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    'expo-router',
    'expo-image',
    [
      'expo-splash-screen',
      {
        // Deliberately blank: the startup intro (components/intro) starts on
        // this same colour and draws the logo itself, so a logo here would
        // appear, vanish and regrow. The app's surface cream, kept in step with
        // the intro by components/intro/__tests__/introBackground.test.ts.
        image: './assets/splash-blank.png',
        resizeMode: 'contain',
        backgroundColor: '#f9f0e8',
      },
    ],
    ...(googleSignInPerEnv[env].iosUrlScheme
      ? [
          [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: googleSignInPerEnv[env].iosUrlScheme },
          ] as [string, { iosUrlScheme: string }],
        ]
      : []),
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Cultuvilla usa tu ubicación para fijar la del pueblo en el mapa.',
      },
    ],
    'expo-apple-authentication',
    [
      'expo-notifications',
      {
        // Tints the small status-bar icon on Android.
        color: '#bb5d3a',
        // The channel a push lands in if it arrives before the app has ever
        // run and created its own (see ensureAndroidChannels). Every push the
        // server sends names a channel explicitly.
        defaultChannel: 'mine',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
