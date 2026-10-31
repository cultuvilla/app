#!/usr/bin/env bash
# Drive the Cultuvilla dev client on an Android AVD, from WSL2 or native Linux.
#
# Under WSL2 the Android emulator runs on the Windows host, so the Linux-side
# `adb` cannot see it: this wrapper uses the Windows-side adb.exe and
# emulator.exe. On native Linux it uses the SDK's own tools ($ANDROID_HOME,
# else ~/Android/Sdk), and `boot` creates the AVD the first time from an
# installed system image. AVD_DEV_HOST=wsl|linux overrides the detection.
#
# Subcommands:
#   boot   [<avd>]            Launch the AVD (default: Cultuvilla_Big) and
#                             wait for boot_completed=1. On Linux, create it
#                             first if missing (CULTUVILLA_AVD_IMAGE,
#                             CULTUVILLA_AVD_DEVICE).
#   reverse                   `adb reverse tcp:8081 tcp:8081` so the device
#                             can reach the Metro bundler running in WSL.
#   open                      Force-stop + open Cultuvilla (Dev) pointed at
#                             http://localhost:8081 via the dev-launcher
#                             deep link.
#   metro                     Start Metro in apps/mobile (foreground, kill
#                             with Ctrl-C). Sets ADB_PATH so expo finds
#                             adb.exe if it ever needs it.
#   shot   [<out.png>]        Save a screenshot (default: /tmp/avd.png).
#   logs   [<seconds>]        Tail logcat for the app process, filtered
#                             for JS warnings / errors / firestore-deny.
#                             Default: stream until Ctrl-C.
#   denies [<seconds>]        Stream ONLY [firestore-deny*] lines.
#                             Default: stream until Ctrl-C.
#   tap    <x> <y>            Tap at logical pixel coordinates.
#   key    <KEYCODE>          Send a keycode (e.g. BACK, HOME, MENU).
#   doctor                    Print device + Metro status.
#
# Usage:
#   ./scripts/avd-dev.sh boot
#   ./scripts/avd-dev.sh reverse
#   ./scripts/avd-dev.sh metro &
#   ./scripts/avd-dev.sh open
#   ./scripts/avd-dev.sh denies
set -euo pipefail

if [ -n "${AVD_DEV_HOST:-}" ]; then
  HOST=$AVD_DEV_HOST
elif grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  HOST=wsl
else
  HOST=linux
fi
case "$HOST" in
  wsl)
    ADB=${ADB:-/mnt/c/Users/alvar/AppData/Local/Android/Sdk/platform-tools/adb.exe}
    EMU=${EMU:-/mnt/c/Users/alvar/AppData/Local/Android/Sdk/emulator/emulator.exe}
    ;;
  linux)
    SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}
    ADB=${ADB:-$SDK/platform-tools/adb}
    EMU=${EMU:-$SDK/emulator/emulator}
    AVDMANAGER=${AVDMANAGER:-$SDK/cmdline-tools/latest/bin/avdmanager}
    # One AVD home for avdmanager and the emulator: avdmanager honours
    # XDG_CONFIG_HOME (set in a desktop session) and would write under
    # ~/.config/.android/avd, where the emulator never looks.
    export ANDROID_AVD_HOME=${ANDROID_AVD_HOME:-$HOME/.android/avd}
    AVD_IMAGE=${CULTUVILLA_AVD_IMAGE:-system-images;android-36;google_apis;x86_64}
    AVD_DEVICE=${CULTUVILLA_AVD_DEVICE:-pixel_7_pro}
    ;;
  *) echo "AVD_DEV_HOST='$HOST' — expected wsl or linux" >&2; exit 2 ;;
esac
PKG=${PKG:-com.cultuvilla.app.dev}
SCHEME=${SCHEME:-cultuvilla}
METRO_URL=${METRO_URL:-http://localhost:8081}
DEFAULT_AVD=${DEFAULT_AVD:-Cultuvilla_Big}

cmd=${1:-doctor}; shift || true

require_adb() {
  [ -x "$ADB" ] || { echo "adb not found at $ADB" >&2; exit 1; }
}

# Linux only: create <avd> from the installed image when the emulator does not
# list it. avdmanager reports a missing optional devices.xml inside the image
# as an "Error:" while creating the AVD correctly, so that line is dropped.
create_avd_if_missing() {
  local avd=$1
  "$EMU" -list-avds 2>/dev/null | grep -qx "$avd" && return 0
  [ -x "$AVDMANAGER" ] || { echo "avdmanager not found at $AVDMANAGER" >&2; exit 1; }
  if [ ! -d "$SDK/${AVD_IMAGE//;//}" ]; then
    echo "system image $AVD_IMAGE is not installed: sdkmanager --install '$AVD_IMAGE'" >&2
    exit 1
  fi
  echo "[boot] creating $avd ($AVD_IMAGE on $AVD_DEVICE)"
  echo no | "$AVDMANAGER" create avd --name "$avd" --package "$AVD_IMAGE" --device "$AVD_DEVICE" \
    2> >(grep -v 'devices\.xml' >&2) >/dev/null
}

case "$cmd" in
  boot)
    require_adb
    avd=${1:-$DEFAULT_AVD}
    if "$ADB" devices | grep -qE "^emulator-.*device$"; then
      echo "[boot] device already attached"
    else
      [ -x "$EMU" ] || { echo "emulator not found at $EMU" >&2; exit 1; }
      [ "$HOST" = linux ] && create_avd_if_missing "$avd"
      echo "[boot] launching $avd"
      # setsid on Linux: its own session, so the window outlives this shell.
      if [ "$HOST" = linux ]; then
        setsid nohup "$EMU" "@$avd" -no-snapshot-save >/tmp/avd-$avd.log 2>&1 </dev/null &
      else
        nohup "$EMU" "@$avd" -no-snapshot-save >/tmp/avd-$avd.log 2>&1 &
      fi
      emu_pid=$!
      disown
    fi
    # Bounded, and on Linux an emulator that exits (an unknown AVD, a bad
    # image) fails at once instead of leaving this loop waiting forever.
    deadline=$((SECONDS + ${AVD_BOOT_TIMEOUT:-300}))
    until "$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' | grep -q 1; do
      if [ "$HOST" = linux ] && [ -n "${emu_pid:-}" ] && ! kill -0 "$emu_pid" 2>/dev/null; then
        echo "[boot] the emulator exited before booting; see /tmp/avd-$avd.log" >&2
        exit 1
      fi
      if [ "$SECONDS" -ge "$deadline" ]; then
        echo "[boot] timed out after ${AVD_BOOT_TIMEOUT:-300}s waiting for boot_completed" >&2
        exit 1
      fi
      sleep 2
    done
    "$ADB" devices
    ;;
  reverse)
    require_adb
    "$ADB" reverse tcp:8081 tcp:8081
    "$ADB" reverse --list
    ;;
  open)
    require_adb
    "$ADB" shell am force-stop "$PKG"
    sleep 1
    encoded=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$METRO_URL")
    "$ADB" shell am start -a android.intent.action.VIEW \
      -d "$SCHEME://expo-development-client/?url=$encoded"
    ;;
  metro)
    cd "$(git rev-parse --show-toplevel)/apps/mobile"
    ADB_PATH="$ADB" exec pnpm start "$@"
    ;;
  shot)
    require_adb
    out=${1:-/tmp/avd.png}
    "$ADB" exec-out screencap -p > "$out"
    echo "$out"
    ;;
  logs)
    require_adb
    pid=$("$ADB" shell pidof "$PKG" | tr -d '\r')
    [ -n "$pid" ] || { echo "$PKG not running" >&2; exit 1; }
    if [ "${1:-}" ]; then
      timeout "$1" "$ADB" logcat -v brief --pid="$pid" 2>&1 \
        | grep -E --line-buffered "ReactNativeJS|firestore-deny|FirebaseError|chromium.*ERROR" || true
    else
      "$ADB" logcat -v brief --pid="$pid" 2>&1 \
        | grep -E --line-buffered "ReactNativeJS|firestore-deny|FirebaseError|chromium.*ERROR"
    fi
    ;;
  denies)
    require_adb
    pid=$("$ADB" shell pidof "$PKG" | tr -d '\r')
    [ -n "$pid" ] || { echo "$PKG not running" >&2; exit 1; }
    if [ "${1:-}" ]; then
      timeout "$1" "$ADB" logcat -v brief --pid="$pid" 2>&1 \
        | grep -E --line-buffered "firestore-deny" || true
    else
      "$ADB" logcat -v brief --pid="$pid" 2>&1 \
        | grep -E --line-buffered "firestore-deny"
    fi
    ;;
  tap)
    require_adb
    "$ADB" shell input tap "$1" "$2"
    ;;
  key)
    require_adb
    "$ADB" shell input keyevent "KEYCODE_$1"
    ;;
  doctor)
    require_adb
    echo "adb     : $ADB"
    "$ADB" version | head -2
    echo "devices :"
    "$ADB" devices
    echo "reverse :"
    "$ADB" reverse --list || true
    pid=$("$ADB" shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)
    echo "$PKG pid: ${pid:-<not running>}"
    if curl -sf "$METRO_URL/status" >/dev/null 2>&1; then
      echo "metro   : up ($METRO_URL)"
    else
      echo "metro   : down ($METRO_URL)"
    fi
    ;;
  *)
    sed -n '2,40p' "$0"
    exit 2
    ;;
esac
