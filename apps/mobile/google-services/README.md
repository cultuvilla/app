# Native Firebase config

`expo-notifications` mints the Android FCM token from the native
`google-services.json`. One file per environment:

| Env | File | Firebase project | Package |
|---|---|---|---|
| dev | `dev/google-services.json` ✅ | `villa-events` | `com.cultuvilla.app.dev` |
| beta | `beta/google-services.json` ✅ | `cultuvilla-beta` | `com.cultuvilla.app.beta` |
| prod | `prod/google-services.json` ✅ | `cultuvilla-prod` | `com.cultuvilla.app` |

Prod and the "Cultuvilla Beta" app both ship through Play (see
[beta-is-its-own-play-app.md](../../../docs/decisions/beta-is-its-own-play-app.md)),
so both files are required; dev is sideload-only.

To refresh one (the Android app must already exist in that Firebase project):

```bash
firebase apps:list ANDROID --project <project> --account cultuvilla.app@gmail.com
firebase apps:sdkconfig ANDROID <appId> --project <project> --account cultuvilla.app@gmail.com \
  --out apps/mobile/google-services/<env>/google-services.json
```

The files carry no secret — the API key inside ships in every APK and is
restricted by package + signing SHA — so they are committed, like the
`.well-known` signing identities. `app.config.ts` only wires
`android.googleServicesFile` when the file exists, so a checkout without one
still builds; that build simply never registers for push.
[googleServices.test.ts](../../../packages/shared/test/ci/googleServices.test.ts)
fails CI if a file is ever swapped for another env's.

Android uses it for push and for native analytics (`@react-native-firebase`).

## iOS — `GoogleService-Info.plist` (analytics only)

iOS push does not need it — its tokens are raw APNs tokens sent to APNs
directly (see [device-notifications.md](../../../docs/plans/ongoing/device-notifications.md)).
`@react-native-firebase/app` does, for native analytics. Its config plugin
throws at prebuild without the file, so `app.config.ts` wires the plugin only
when `<env>/GoogleService-Info.plist` exists; without it the iOS build still
works and analytics is a no-op.

Each env needs an iOS app registered in its Firebase project, with the
bundle id from `bundleIdPerEnv` (`com.cultuvilla.app.dev`,
`com.cultuvilla.app.beta`, `com.cultuvilla.app`), then:

```bash
firebase apps:create IOS "Cultuvilla iOS" --bundle-id <bundleId> --project <project> --account cultuvilla.app@gmail.com
firebase apps:sdkconfig IOS <appId> --project <project> --account cultuvilla.app@gmail.com \
  --out apps/mobile/google-services/<env>/GoogleService-Info.plist
```

iOS beta (TestFlight) builds the `production` profile, so it uses the prod plist.
