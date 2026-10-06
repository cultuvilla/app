---
name: drive-android-avd
description: Drive a Cultuvilla dev-client Android AVD or physical phone (USB or wireless) from WSL2 — boot the emulator, expose Metro to the device, deep-link into the dev client, screenshot, and tail logcat. Use whenever the task needs to actually run the mobile app and observe its behavior (e.g. capture `[firestore-deny]` lines, verify a UI change, reproduce a runtime bug). Encodes the WSL2/Windows adb split so you don't waste time on `adb devices` showing nothing.
---

# Drive the Cultuvilla AVD from WSL

## The one thing to know

Under WSL2 the Android emulator runs on the **Windows host**. The Linux-side `adb` cannot see it (and trying to start its own `adb` server fights the Windows one for port 5037). **Always use the Windows-side `adb.exe`**:

```
/mnt/c/Users/alvar/AppData/Local/Android/Sdk/platform-tools/adb.exe
```

The wrapper `scripts/avd-dev.sh` already encodes this. Reach for it before reinventing the chain.

## Quickstart

```bash
scripts/avd-dev.sh boot       # launch Cultuvilla_Big AVD, wait for boot_completed
scripts/avd-dev.sh reverse    # adb reverse tcp:8081 → device sees Metro
scripts/avd-dev.sh metro &    # start Metro in apps/mobile (background)
scripts/avd-dev.sh open       # force-stop + deep-link the dev client at Metro
scripts/avd-dev.sh denies     # stream [firestore-deny*] lines from logcat
```

A full "capture boot-time firestore denials" loop:

```bash
scripts/avd-dev.sh boot
scripts/avd-dev.sh reverse
scripts/avd-dev.sh metro >/tmp/metro.log 2>&1 &
until grep -q "Waiting on http" /tmp/metro.log; do sleep 1; done
scripts/avd-dev.sh open
# Ask the human to sign in if needed (the app's auth gate is the only thing
# that triggers the boot-time Firestore reads we wrapped in
# apps/mobile/lib/firestoreErrorLog.ts).
scripts/avd-dev.sh denies 60 | tee /tmp/denies.log
```

## Physical phone (USB or wireless)

The same chain drives a real phone — skip `boot`, the rest is identical. `adb reverse`
makes the phone's `localhost:8081` reach Metro in WSL, so **don't use `--lan`**: WSL2
runs in NAT mode, and the IP Metro advertises (a Docker bridge like `172.20.0.1`, or
the WSL `eth0`) is unreachable from the phone.

```bash
pnpm app:start                # plain, no --lan
scripts/avd-dev.sh reverse
scripts/avd-dev.sh open
```

**Wireless** is `adb reverse` over Wi-Fi debugging — no portproxy, no firewall rule.
Phone and PC on the same Wi-Fi; Developer options → *Wireless debugging* on.

```bash
ADB=/mnt/c/Users/alvar/AppData/Local/Android/Sdk/platform-tools/adb.exe
$ADB pair <ip>:<pair-port>    # once: "Pair device with pairing code", type the code
$ADB connect <ip>:<port>      # every session: the port on the main Wireless debugging
                              # screen (NOT the pairing port); it changes on each toggle
```

**More than one device attached** (phone + AVD, or the phone over USB *and* TLS)
makes every adb call fail with `more than one device/emulator`. Close the extra one,
or select the target: `adb.exe` is a Windows process, so the env var only reaches it
through `WSLENV`:

```bash
export ANDROID_SERIAL=3B151FDJH000V3            # serial from `adb.exe devices`
export WSLENV="${WSLENV:+$WSLENV:}ANDROID_SERIAL" # no /u flag — that is the Win→WSL direction only
```

**Phone stuck `offline`** (often after the screen locks mid-install): restarting the
adb server does not fix it. Unlock, replug, accept *Allow USB debugging*; failing that,
toggle USB debugging or *Revoke USB debugging authorizations*.

## Subcommands

| Subcommand | What it does |
|---|---|
| `boot [<avd>]`   | Launch AVD (default `Cultuvilla_Big`), wait for `getprop sys.boot_completed = 1`. |
| `reverse`        | `adb reverse tcp:8081 tcp:8081`. Re-run after every emulator boot. |
| `open`           | Force-stop, then deep-link `cultuvilla://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. The dev-launcher activity reads the URL and loads the bundle. |
| `metro`          | `cd apps/mobile && pnpm start` with `ADB_PATH` pre-set. Run with `&` or in a separate pane. |
| `shot [<out>]`   | `adb exec-out screencap -p > out.png`. Default `/tmp/avd.png`. |
| `logs [<sec>]`   | Tail logcat for the app PID, filtered to `ReactNativeJS\|firestore-deny\|FirebaseError\|chromium.*ERROR`. |
| `denies [<sec>]` | Tail logcat for the app PID, filtered to `firestore-deny` only. |
| `tap <x> <y>`    | `adb shell input tap`. Use after `shot` to figure out coordinates. |
| `key <KEYCODE>`  | `adb shell input keyevent KEYCODE_<...>`. Common: `BACK`, `HOME`, `MENU`. |
| `doctor`         | Print adb path, attached devices, reverse list, app PID, Metro reachability. Run this first when something feels off. |

## When you'd use this skill

- Capturing runtime logs the harness can't otherwise observe (the `[firestore-deny]` pattern from `apps/mobile/lib/firestoreErrorLog.ts`, RN warnings, crash stacks).
- Verifying a UI change after editing TSX in `apps/mobile/` — bundle reloads via Metro Fast Refresh, no rebuild needed.
- Reproducing a bug the user reported on their AVD.

## When this skill does NOT apply

- Native config changes (new Expo plugin, native module install). The app needs a clean prebuild + reinstall first — use the `expo-native-rebuild` skill, then come back here to run.
- iOS-only repros. This skill is Android/WSL specific.
- Headless test runs (unit tests, rules tests, emulator tests). Use `pnpm test`, `pnpm test:rules`, `pnpm test:integration` — those don't need a device.
- The Maestro E2E suite (`pnpm test:e2e:android`). It does use the AVD, but it needs a release APK and Linux-side adb rather than this Metro/dev-client loop. Follow [apps/mobile/e2e/native/README.md](../../../apps/mobile/e2e/native/README.md) § "Under WSL2": the `-a` adb server launched as a Windows process, a forwarder for port 5037, `EMULATOR_BIND_HOST=0.0.0.0`, the CI-pinned Maestro, and `E2E_ANDROID_DEVICE=emulator-5554` whenever a phone is also attached.

## Gotchas

1. **`adb devices` from Linux returns nothing even with the AVD running.** Correct. Use `adb.exe` via the wrapper. If you forget and start the Linux `adb` daemon, it'll error with `Address already in use` because Windows already owns port 5037.
2. **Dev-launcher menu opens instead of the app.** That's the *bundle picker*. The `open` subcommand bypasses it by passing the Metro URL in the deep link. If the menu still shows, the URL scheme may have changed in `apps/mobile/app.config.ts` (current: `cultuvilla`) — re-derive from `grep "scheme:" apps/mobile/app.config.ts` and `export SCHEME=...` before calling `open`.
3. **No `[firestore-deny]` lines appear.** Three reasons in order of likelihood:
   - User isn't signed in. The reads we wrapped only fire after `AuthProvider` resolves a user. `shot` to confirm; if you see `Iniciar sesión`, the human has to sign in (we can't, no credentials).
   - The call site isn't wrapped. Grep `apps/mobile/app/(tabs)/*.tsx` for `withFirestoreErrorLog` and confirm every Firestore call from the screen is wrapped. The global `unhandledrejection` hook in `apps/mobile/lib/firebaseInit.ts` is the safety net — its lines come through as `[firestore-deny:unhandled]`.
   - Hermes/Fabric is silently swallowing `console.warn`. Unlikely on RN 0.81 + Expo SDK 54, but if so widen the filter: `logs` (which includes `ReactNativeJS` generally) instead of `denies`.
4. **The emulator is on a different Windows account.** The `EMU=` / `ADB=` paths in the script default to `/mnt/c/Users/alvar/...`. Override via env vars when running.
5. **Snapshot save can corrupt state.** The script passes `-no-snapshot-save` so a forced kill doesn't poison the next boot.
6. **Red screen `Unable to resolve "react-refresh/runtime"`** (or another package that is plainly installed). `metro.config.js` sets `disableHierarchicalLookup`, so Metro only sees the root and `apps/mobile` `node_modules` — it depends on pnpm's `shamefully-hoist` links. pnpm can lose a hoisted link while `node_modules/.modules.yaml` still lists it as `public`, and then `pnpm install` won't restore it. Seen 2026-10-06 (`react-refresh`, `@types/estree`, `@rolldown/pluginutils`, after the web deps were dropped). Fix with `pnpm install --force`, or recreate the missing `node_modules/<pkg>` symlink to `.pnpm/<pkg>@<ver>/node_modules/<pkg>`.
7. **The dev-launcher error screen right after launch** with a missing native module means the installed dev client predates a native dependency — rebuild it (`expo-native-rebuild`); a JS reload can't add native code.

## Closely-related skills

- [expo-native-rebuild](../expo-native-rebuild/SKILL.md) — needed before this skill whenever native config changes.
- [fix-bug](../fix-bug/SKILL.md) — debugging procedure that often ends in "run the app and reproduce" — this skill is the "run the app" part.
