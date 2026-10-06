# cultuvilla mobile

Expo SDK 54 React Native app. See [docs/decisions/mobile-app-scaffold.md](../../docs/decisions/mobile-app-scaffold.md) for the scaffold design rationale.

## Local dev

### 1. Create `.env`

Copy `.env.example` to `.env` (gitignored) and fill in your Firebase project values. The web app's `.env.local` has the same dev values without the `NEXT_PUBLIC_` prefix.

```
APP_ENV=dev
FIREBASE_API_KEY_DEV=...
FIREBASE_AUTH_DOMAIN_DEV=...
FIREBASE_PROJECT_ID_DEV=...
FIREBASE_STORAGE_BUCKET_DEV=...
FIREBASE_MESSAGING_SENDER_ID_DEV=...
FIREBASE_APP_ID_DEV=...
```

These are read by `app.config.ts` at bundle time and injected into `Constants.expoConfig.extra.firebaseConfig`. **Never commit real keys** — Firebase Web SDK config is not secret, but the convention is `.env` stays local.

### 2. Start Metro

From the repo root:

| Command | When |
|---|---|
| `pnpm app:start` | Default. Works when your dev machine and phone are on the same Wi-Fi and the LAN allows direct connections. |
| `pnpm app:start:tunnel` | When the phone is not on your network. Routes through Expo's ngrok-style tunnel. Slower bundle. |
| `pnpm app:start:lan` | **Use this on WSL2.** Advertises the Windows host's LAN IP so the phone can scan the QR on the same Wi-Fi (needs the Windows portproxy for 8081 — see the `drive-android-avd` skill). Off WSL it is plain `expo start --lan`. |
| `pnpm app:android` / `pnpm app:ios` | Auto-open on a connected emulator / simulator. |

### 3. Connect from your phone

Install **Expo Go** (iOS App Store / Google Play). On Android, scan the QR with Expo Go directly. On iOS, scan with the Camera app.

If the QR scan never connects:
- WSL2 / Linux desktop → use `pnpm app:start:tunnel`.
- Native Linux/Mac on same Wi-Fi → check firewall isn't blocking port 8081 (8082 if 8081 was taken).
- Corporate / guest networks often block peer-to-peer LAN → tunnel mode.

If the app launches but immediately shows a red error screen:
- `firebaseConfig missing from expoConfig.extra` → your `.env` isn't being read. Stop Metro, confirm `.env` exists in `apps/mobile/`, restart.
- Any Firebase init error → values in `.env` are wrong. Pull them from `apps/web/.env.local` (same dev project) without the `NEXT_PUBLIC_` prefix.

## Builds (EAS)

| Profile        | APP_ENV | Distribution | Use |
|---------------|---------|--------------|-----|
| `development` | dev     | internal     | Dev client on simulators / devices |
| `preview-dev` | dev     | internal     | Shareable dev build |
| `beta`        | beta    | store        | "Cultuvilla Beta" app, Play internal track (auto on merge to `beta`) |
| `production`  | prod    | store        | App Store / Play Store |

Trigger: `eas build --profile <name> --platform <ios|android>`
