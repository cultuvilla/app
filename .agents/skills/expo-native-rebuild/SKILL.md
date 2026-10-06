---
name: expo-native-rebuild
description: Rebuild cultuvilla native projects after Expo config plugin changes, native module installs, or app.config.ts mutations. Use when adding/removing a package with an Expo config plugin, changing the plugins array, or diagnosing native init crashes in apps/mobile/.
---

# Rebuild cultuvilla native projects after Expo plugin changes

## When this applies

Run a clean prebuild whenever any of the following is true:

1. Added or removed a package that ships an Expo config plugin (`@react-native-firebase/app`, `@react-native-firebase/crashlytics`, `expo-camera`, `@sentry/react-native`, etc.).
2. Changed the `plugins` array in [`apps/mobile/app.config.ts`](../../../apps/mobile/app.config.ts) (the Expo dynamic config; this file is the source of truth for plugin registration).
3. Changed `expo.android` or `expo.ios` build properties via `expo-build-properties` in `app.config.ts`.
4. App launches and immediately force-closes with a native error — `FirebaseInitProvider` crash, missing Crashlytics build ID, or a similar Cocoa/Gradle plugin error that indicates a config injection never landed.

`expo run:android` / `run:ios` does **incremental** prebuild — it does NOT re-merge new Expo config plugins into existing `android/build.gradle`, `android/app/build.gradle`, or `ios/Podfile`. Result: the new plugin is in `app.config.ts` but its Gradle/CocoaPods injection never lands.

## Cultuvilla paths

| Item | Path |
|---|---|
| Mobile app root | `apps/mobile/` |
| Expo dynamic config | `apps/mobile/app.config.ts` |
| EAS Build profiles | `apps/mobile/eas.json` |
| Android prebuild output (gitignored) | `apps/mobile/android/` |
| iOS prebuild output (gitignored) | `apps/mobile/ios/` |

`apps/mobile/android/` and `apps/mobile/ios/` are gitignored prebuild output — they are regenerated from `app.config.ts` on every clean prebuild. Safe to nuke.

## EAS profiles

`apps/mobile/eas.json` defines three profiles:

| Profile | Firebase environment |
|---|---|
| `dev` | dev Firebase project |
| `beta` | beta Firebase project |
| `prod` | prod Firebase project |

Use `--profile <name>` in EAS build commands to target the right environment.

## The fix

### Step 1 — Clean prebuild

```bash
cd apps/mobile
pnpm --filter cultuvilla-mobile exec expo prebuild --clean
# or target a specific platform:
pnpm --filter cultuvilla-mobile exec expo prebuild --platform android --clean
pnpm --filter cultuvilla-mobile exec expo prebuild --platform ios --clean
```

`--clean` nukes `android/` and `ios/` before regenerating — this is the critical flag. Without it, stale Gradle/Podfile injections survive.

### Step 2 — Build with EAS (if new native code needs a new binary)

When the change adds new native code (not just JS-side config), a new dev-client build is required:

```bash
cd apps/mobile
DEV_AUTOLOGIN_EMAIL= DEV_AUTOLOGIN_PASSWORD= eas build --profile development --platform android
# or --platform ios, or --platform all
```

**Blank the two `DEV_AUTOLOGIN_*` vars.** They live in the local `.env` and feed
`extra.devAutoLogin` in `app.config.ts`, but not the EAS `development` environment.
`runtimeVersion` is `fingerprint`, so the differing config fails the build in
*Configure expo-updates* with "Runtime version mismatch". The dev client still gets
auto-login at runtime from Metro's manifest.

After the build completes, install the new binary on the device/emulator before launching the JS bundle:

```bash
ADB=/mnt/c/Users/alvar/AppData/Local/Android/Sdk/platform-tools/adb.exe
curl -sL -o /mnt/c/Users/alvar/AppData/Local/Temp/cultuvilla-dev.apk <artifact .apk url>
$ADB install -r 'C:\Users\alvar\AppData\Local\Temp\cultuvilla-dev.apk'   # adb.exe needs a Windows path
```

`INSTALL_FAILED_UPDATE_INCOMPATIBLE` means the installed `com.cultuvilla.app.dev` was
signed by another key (a local `expo run:android` build). `adb uninstall` it first —
that wipes its local data, sign-in included. EAS-built dev clients share one
EAS-managed keystore (created 2026-10-06), so they update over each other.

### Step 3 — Local rebuild (optional, for faster iteration)

If you have Android Studio / Xcode and a local development environment:

```bash
pnpm --filter cultuvilla-mobile exec expo run:android
pnpm --filter cultuvilla-mobile exec expo run:ios
```

These also trigger a prebuild step, but use `--clean` via `expo prebuild --clean` first if you suspect stale injections.

## Don't

- Manually edit `android/` or `ios/` files to fix plugin injections — they are blown away on the next clean prebuild. Fix the upstream `app.config.ts` plugin entry instead.
- Run `eas build` without confirming which profile maps to the intended Firebase environment.
- Skip `--clean` when adding a new Expo config plugin — incremental prebuild silently skips new injections.

## When this skill applies

- The user is adding or removing a native package with an Expo config plugin.
- The user is changing `apps/mobile/app.config.ts` plugin entries or `expo-build-properties`.
- The user reports a native crash on app launch that looks like a missing Firebase/Crashlytics/native-module init.
- The user asks "why isn't my plugin being applied?" after a `run:android`/`run:ios`.
