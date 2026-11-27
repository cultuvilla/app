#!/usr/bin/env bash
# Build the Cultuvilla Android dev client once and install it on every connected
# phone and every RUNNING Cultuvilla AVD. Manual: nothing runs it on a timer.
#
# Usage:
#   pnpm app:dev-client:rollout                  build from this checkout, install everywhere
#   pnpm app:dev-client:rollout --if-stale       only when the native fingerprint changed
#                                                since the last rollout
#   pnpm app:dev-client:rollout --skip-build     reinstall the last APK built here
#   pnpm app:dev-client:rollout --only phones    physical devices only (or: avds)
#   pnpm app:dev-client:rollout --dry-run        say what it would build and where it would
#                                                install, and touch nothing
#   pnpm app:dev-client:rollout --wipe-on-mismatch
#       a device holding a build signed with another key (an EAS build) cannot
#       be upgraded in place: uninstall it first. That clears the app's data —
#       you sign in again — so it is opt-in; without it the device is reported.
#
# Which devices: every attached non-emulator serial (a phone, USB or wireless),
# and every running emulator whose AVD is `Cultuvilla_*` but not an E2E one.
# Other repos' emulators share this adb server; they are read by name
# (`adb -s <serial> emu avd name`) and never touched. Every adb call names its
# serial, and the rollout never changes an `adb reverse` or Metro.
# A stopped Cultuvilla AVD is reported, not booted: boot it yourself on a port
# of your own (AGENTS.md § Commands), then rerun with --skip-build.
#
# One APK carries arm64-v8a (phones) and x86_64 (AVDs). The APK, the
# fingerprint it was built from, and the fingerprint last rolled out to EVERY
# device are kept in ~/.cache/cultuvilla/dev-client/. A rollout with any
# failure records nothing, so the next --if-stale run tries again.
#
# Test seams (scripts/__tests__/dev-client-rollout.test.mjs): adb and emulator
# come from $ANDROID_HOME; ROLLOUT_FINGERPRINT and ROLLOUT_BUILD (a command
# given the APK path to write) replace the fingerprint and the gradle build.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP_DIR="$REPO_ROOT/apps/mobile"
PACKAGE=com.cultuvilla.app.dev
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/cultuvilla/dev-client"
APK_OUT="$CACHE_DIR/cultuvilla-devclient.apk"
APK_FINGERPRINT_FILE="$CACHE_DIR/apk-fingerprint"
ROLLED_OUT_FINGERPRINT_FILE="$CACHE_DIR/rolled-out-fingerprint"

build=yes
if_stale=no
only=all
dry_run=no
wipe_on_mismatch=no
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) build=no ;;
    --if-stale) if_stale=yes ;;
    --dry-run) dry_run=yes ;;
    --only)
      only="${2:-}"
      shift || true
      [[ "$only" == phones || "$only" == avds ]] || { echo "rollout: --only takes phones or avds" >&2; exit 2; }
      ;;
    --wipe-on-mismatch) wipe_on_mismatch=yes ;;
    -h | --help) sed -n '2,33p' "$0"; exit 0 ;;
    *) echo "rollout: unknown argument '$1' (see --help)" >&2; exit 2 ;;
  esac
  shift
done

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
[[ -x "$ANDROID_HOME/platform-tools/adb" ]] || { echo "rollout: no adb under $ANDROID_HOME (set ANDROID_HOME)" >&2; exit 1; }
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"
# A pinned ANDROID_SERIAL would make an adb call without -s hit one device;
# every call here names its serial, and none should inherit a pin.
unset ANDROID_SERIAL

# ── fingerprint ─────────────────────────────────────────────────────────────
# The same command scripts/dev-sync.sh runs, so "the fingerprint changed" means
# the same thing in its notification and here. It moves when a native
# dependency, a config plugin or a native field of app.config.ts changes.
fingerprint() {
  if [[ -n "${ROLLOUT_FINGERPRINT:-}" ]]; then echo "$ROLLOUT_FINGERPRINT"; return; fi
  (cd "$APP_DIR" && ./node_modules/.bin/fingerprint fingerprint:generate . 2>/dev/null | jq -r .hash)
}

read_file() { [[ -f "$1" ]] && cat "$1" || true; }

current_fp="$(fingerprint)"
[[ -n "$current_fp" && "$current_fp" != null ]] || { echo "rollout: could not compute the native fingerprint (pnpm install?)" >&2; exit 1; }

if [[ "$if_stale" == yes ]]; then
  if [[ "$(read_file "$ROLLED_OUT_FINGERPRINT_FILE")" == "$current_fp" ]]; then
    echo "rollout: every device already has a dev client at this native fingerprint — nothing to do."
    exit 0
  fi
  # The APK is current but an earlier rollout did not reach every device.
  [[ -f "$APK_OUT" && "$(read_file "$APK_FINGERPRINT_FILE")" == "$current_fp" ]] && build=no
fi

# ── devices ─────────────────────────────────────────────────────────────────
attached() { "$ADB" devices | tr -d '\r' | awk 'NR > 1 && $2 == "device" { print $1 }'; }
is_ours() { [[ "$1" == Cultuvilla_* && "$1" != *[Ee]2[Ee]* ]]; }
# Every early-exit reader (`grep -q`, `head`) reads a captured string, never a
# pipe: it would exit on its first line, the writer die of SIGPIPE and, under
# pipefail, the test read 141 — a flake on exactly the output that matched.
avd_of() {
  local out
  out="$("$ADB" -s "$1" emu avd name 2>/dev/null | tr -d '\r')" || return
  printf '%s\n' "${out%%$'\n'*}"
}

declare -a phones=() avd_serials=() avd_names=() report=()
running_avds=" "
while read -r serial; do
  [[ -n "$serial" ]] || continue
  if [[ "$serial" == emulator-* ]]; then
    name="$(avd_of "$serial")"
    running_avds+="$name "
    [[ "$only" != phones ]] && is_ours "$name" && { avd_serials+=("$serial"); avd_names+=("$name"); }
  elif [[ "$only" != avds ]]; then
    phones+=("$serial")
  fi
done < <(attached)

if [[ "$only" != avds && ${#phones[@]} -eq 0 ]]; then
  report+=("– no phone attached (plug it in, or turn on Wireless debugging and adb connect)")
fi
if [[ "$only" != phones ]]; then
  while read -r avd; do
    [[ -n "$avd" ]] && is_ours "$avd" && [[ "$running_avds" != *" $avd "* ]] \
      && report+=("– $avd is not running; boot it on its own port and rerun with --skip-build")
  done < <("$EMULATOR" -list-avds 2>/dev/null || true)
fi

if [[ "$dry_run" == yes ]]; then
  if [[ "$build" == yes ]]; then
    echo "rollout: would build the dev client at fingerprint ${current_fp:0:12} into $APK_OUT"
  else
    echo "rollout: would reuse $APK_OUT"
  fi
  for s in "${phones[@]}"; do echo "rollout: would install on phone $s"; done
  for i in "${!avd_serials[@]}"; do echo "rollout: would install on ${avd_names[$i]} (${avd_serials[$i]})"; done
  (( ${#report[@]} == 0 )) || printf '  %s\n' "${report[@]}"
  exit 0
fi

mkdir -p "$CACHE_DIR"

# ── build ───────────────────────────────────────────────────────────────────
build_apk() {
  local out="$1"
  if [[ -n "${ROLLOUT_BUILD:-}" ]]; then
    $ROLLOUT_BUILD "$out"
    return
  fi
  echo "rollout: building the dev client at $(git -C "$REPO_ROOT" rev-parse --short HEAD) (fingerprint ${current_fp:0:12})"
  # A clean prebuild: an incremental one skips new config-plugin injections
  # (the expo-native-rebuild skill). android/ is gitignored output.
  (cd "$APP_DIR" && APP_ENV=dev npx expo prebuild --platform android --clean --no-install)
  (cd "$APP_DIR/android" && APP_ENV=dev ./gradlew :app:assembleDebug -x lint -x test \
    -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon --console=plain)
  cp "$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk" "$out"
}

if [[ "$build" == yes ]]; then
  rm -f "$APK_FINGERPRINT_FILE"
  build_apk "$APK_OUT"
  echo "$current_fp" > "$APK_FINGERPRINT_FILE"
elif [[ ! -f "$APK_OUT" ]]; then
  echo "rollout: --skip-build, but no APK at $APK_OUT yet" >&2
  exit 1
fi

# A release APK embeds the JS bundle and ignores Metro; on a dev device that is
# silent and reads as "my change does nothing". Refuse it. The listing is read
# whole before it is searched: `unzip | grep -q` lets grep exit on the first
# match, unzip die of SIGPIPE and, under pipefail, report "no bundle" for
# exactly the APK that has one.
if ! listing="$(unzip -Z1 "$APK_OUT" 2>/dev/null)"; then
  echo "rollout: cannot read $APK_OUT as an APK." >&2
  exit 1
fi
if grep -qx 'assets/index.android.bundle' <<< "$listing"; then
  echo "rollout: $APK_OUT embeds a JS bundle — that is a release build, not the dev client." >&2
  exit 1
fi

# ── install ─────────────────────────────────────────────────────────────────
# From the first install on, no device is known to match the record any more:
# a run that fails half-way must not leave an older "everyone has X" standing.
rm -f "$ROLLED_OUT_FINGERPRINT_FILE"

install_on() {
  local serial="$1" label="$2" out
  if out="$("$ADB" -s "$serial" install -r "$APK_OUT" 2>&1)"; then
    report+=("✓ $label ($serial)")
    return 0
  fi
  if grep -q 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' <<< "$out"; then
    if [[ "$wipe_on_mismatch" != yes ]]; then
      report+=("✗ $label ($serial) — holds a build signed with another key (EAS); rerun with --wipe-on-mismatch to replace it (clears the app's data)")
      return 1
    fi
    "$ADB" -s "$serial" uninstall "$PACKAGE" >/dev/null 2>&1 || true
    if out="$("$ADB" -s "$serial" install "$APK_OUT" 2>&1)"; then
      report+=("✓ $label ($serial) — replaced a build signed with another key; sign in again")
      return 0
    fi
  fi
  report+=("✗ $label ($serial) — $(tail -1 <<< "$out")")
  return 1
}

for serial in "${phones[@]}"; do
  model="$("$ADB" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
  install_on "$serial" "${model:-phone}" || true
done
for i in "${!avd_serials[@]}"; do
  install_on "${avd_serials[$i]}" "${avd_names[$i]}" || true
done

echo
echo "rollout: dev client $(git -C "$REPO_ROOT" rev-parse --short HEAD), fingerprint ${current_fp:0:12}"
(( ${#report[@]} == 0 )) || printf '  %s\n' "${report[@]}"
report_text="$(printf '%s\n' "${report[@]}")"
if grep -q '^✗' <<< "$report_text"; then
  exit 1
fi
# Only a rollout that reached every device it set out to counts: --only, a
# stopped Cultuvilla AVD, or a --skip-build of an APK of another fingerprint
# leaves the record alone.
if [[ "$only" == all && "$(read_file "$APK_FINGERPRINT_FILE")" == "$current_fp" ]] \
  && ! grep -q 'is not running' <<< "$report_text"; then
  echo "$current_fp" > "$ROLLED_OUT_FINGERPRINT_FILE"
fi
